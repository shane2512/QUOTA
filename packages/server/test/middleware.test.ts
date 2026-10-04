import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { QuotaClient, quotaFetch, quotaToolMeta } from "@quota/client";
import { SparseMerkleTree, httpPayloadHash, identityCommitment, loadArtifacts, rateCommitment, toolPayloadHash } from "@quota/core";
import { QuotaVerifier, quotaExpress, quotaHono, quotaTool, type Violation } from "../src/index.ts";
import { SqliteNullifierStore } from "../src/sqlite.ts";

// Real Groth16 proofs, real Express / Hono / MCP SDK instances. Root checks are local (tree below).
const artifacts = loadArtifacts();
const SECRET = 0xabcdef0123456789n;
const LIMIT = 1n; // one request per epoch, so the second distinct request is a violation
const tree = new SparseMerkleTree(20);
const index = tree.insert(rateCommitment(identityCommitment(SECRET), LIMIT));
const roots = { isKnownRoot: async (r: bigint) => r === tree.root };
const NOW = () => 1_790_000_000;
const agent = () =>
  new QuotaClient({ secret: SECRET, limit: LIMIT, artifacts, merkleProof: () => tree.proof(index), now: NOW, allowOveruse: true });
const verifier = (serverId: string, onViolation?: (v: Violation) => void, store?: SqliteNullifierStore) =>
  new QuotaVerifier({ serverId, vkey: artifacts.vkey, roots, now: NOW, onViolation, store });

after(async () => {
  await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
});

test("express: ok, replay 409, missing 401, tampered body 401, violation 429", async () => {
  const seen: Violation[] = [];
  const app = express();
  app.use(express.json());
  app.post("/search", quotaExpress(verifier("api-x", (v) => void seen.push(v))), (req, res) => {
    res.json({ results: [`echo:${(req.body as { q: string }).q}`] });
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const a = agent();
    const qfetch = quotaFetch(a, "api-x");
    const r1 = await qfetch(`${base}/search`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"q":"monad","n":1}' });
    assert.equal(r1.status, 200);
    assert.deepEqual(await r1.json(), { results: ["echo:monad"] });

    // a header captured from that request, replayed verbatim
    const hash = httpPayloadHash("POST", "/search", { n: 1, q: "monad" }); // key order does not matter
    const p = await a.prove("api-x", hash, 0n);
    const { encodeProof } = await import("@quota/core");
    const replay = await fetch(`${base}/search`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-quota-proof": encodeProof(p) },
      body: '{"n":1,"q":"monad"}',
    });
    assert.equal(replay.status, 409);

    const missing = await fetch(`${base}/search`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: "quota", reason: "missing" });

    // proof made for one body, sent with another
    const p2 = await a.prove("api-x", httpPayloadHash("POST", "/search", '{"q":"a"}'), 0n);
    const tampered = await fetch(`${base}/search`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-quota-proof": encodeProof(p2) },
      body: '{"q":"b"}',
    });
    assert.equal(tampered.status, 401);
    assert.equal(((await tampered.json()) as { reason: string }).reason, "bad-payload");

    // a different request with the same (only) message id → violation, secret recovered
    const r3 = await qfetch(`${base}/search`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"q":"other"}' });
    assert.equal(r3.status, 429);
    assert.equal(seen.length, 1);
    assert.ok(seen[0].secret === SECRET);
  } finally {
    server.close();
  }
});

test("hono: ok on GET with query, then 429 on a second request in the epoch", async () => {
  const app = new Hono();
  app.use("/data/*", quotaHono(verifier("api-h")));
  app.get("/data/item", (c) => c.json({ id: c.req.query("id") }));
  const qfetch = quotaFetch(agent(), "api-h", (input, init) => Promise.resolve(app.request(String(input), init)));
  const r1 = await qfetch("http://localhost/data/item?id=7");
  assert.equal(r1.status, 200);
  assert.deepEqual(await r1.json(), { id: "7" });
  const r2 = await qfetch("http://localhost/data/item?id=8");
  assert.equal(r2.status, 429);
  const none = await app.request("http://localhost/data/item?id=9");
  assert.equal(none.status, 401);
});

test("mcp: tool call with proof in _meta succeeds; without proof or with wrong args it is a tool error", async () => {
  const server = new McpServer({ name: "quota-test", version: "0.0.0" });
  server.registerTool(
    "lookup",
    { description: "echo", inputSchema: { term: z.string() } },
    quotaTool(verifier("mcp-x"), "lookup", async ({ term }: { term: string }) => ({ content: [{ type: "text" as const, text: `found ${term}` }] })),
  );
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "agent", version: "0.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  const a = agent();

  const ok = await client.callTool({ name: "lookup", arguments: { term: "rln" }, _meta: await quotaToolMeta(a, "mcp-x", "lookup", { term: "rln" }) });
  assert.equal(ok.isError, undefined);
  assert.deepEqual(ok.content, [{ type: "text", text: "found rln" }]);

  const none = await client.callTool({ name: "lookup", arguments: { term: "rln" } });
  assert.equal(none.isError, true);
  assert.match((none.content as { text: string }[])[0].text, /missing/);

  const p = await a.prove("mcp-x", toolPayloadHash("lookup", { term: "a" }), 0n);
  const { encodeProof } = await import("@quota/core");
  const wrong = await client.callTool({ name: "lookup", arguments: { term: "b" }, _meta: { "quota/proof": encodeProof(p) } });
  assert.equal(wrong.isError, true);
  assert.match((wrong.content as { text: string }[])[0].text, /bad-payload/);
  await client.close();
});

test("sqlite store: violation is caught across a server restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-"));
  const file = join(dir, "n.db");
  try {
    const a = agent();
    const h1 = httpPayloadHash("GET", "/x", "");
    const h2 = httpPayloadHash("GET", "/y", "");
    const p1 = await a.prove("api-s", h1, 0n);
    const p2 = await a.prove("api-s", h2, 0n);

    const s1 = new SqliteNullifierStore(file);
    assert.equal((await verifier("api-s", undefined, s1).verify(p1, h1)).ok, true);
    s1.close(); // "restart"

    const seen: Violation[] = [];
    const s2 = new SqliteNullifierStore(file);
    const v2 = verifier("api-s", (v) => void seen.push(v), s2);
    assert.deepEqual(await v2.verify(p1, h1), { ok: false, reason: "replay" });
    assert.deepEqual(await v2.verify(p2, h2), { ok: false, reason: "violation" });
    assert.ok(seen[0].secret === SECRET);
    await s2.prune(p1.epoch + 1n);
    assert.equal((await v2.verify(p1, h1)).ok, true); // pruned: old epoch forgotten
    s2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
