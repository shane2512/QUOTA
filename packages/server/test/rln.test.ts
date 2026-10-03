import { after, test } from "node:test";
import assert from "node:assert/strict";
import { QuotaClient, QuotaExhausted } from "@quota/client";
import { SparseMerkleTree, identityCommitment, loadArtifacts, rateCommitment, type QuotaProof } from "@quota/core";
import { QuotaVerifier, type Violation } from "../src/index.ts";

// Real Groth16 proofs with the vendored ceremony artifacts. No mocks of the circuit.
const artifacts = loadArtifacts();
const NOW = 1_790_000_000; // fixed clock
const SECRET = 0x1234_5678_9abc_def0_1234_5678_9abc_def0n;
const LIMIT = 3n;

const tree = new SparseMerkleTree(20);
tree.insert(rateCommitment(identityCommitment(999n), 10n)); // another member
const index = tree.insert(rateCommitment(identityCommitment(SECRET), LIMIT));
const roots = { isKnownRoot: async (r: bigint) => r === tree.root };

function client(allowOveruse = false) {
  return new QuotaClient({ secret: SECRET, limit: LIMIT, artifacts, merkleProof: () => tree.proof(index), now: () => NOW, allowOveruse });
}
function verifier(serverId: string, onViolation?: (v: Violation) => void) {
  return new QuotaVerifier({ serverId, vkey: artifacts.vkey, roots, now: () => NOW, onViolation });
}
const payload = (i: number) => (`0x${i.toString(16).padStart(64, "0")}`) as `0x${string}`;

after(async () => {
  // snarkjs keeps bn128 worker threads alive
  await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
});

test("honest requests verify, then the client refuses to exceed its limit", async () => {
  const c = client();
  const v = verifier("search");
  for (let i = 0; i < 3; i++) {
    const h = await c.signRequest("search", payload(i));
    const r = await v.verifyHeader(h["x-quota-proof"], payload(i));
    assert.equal(r.ok, true, r.ok ? "" : r.reason);
  }
  await assert.rejects(c.signRequest("search", payload(3)), QuotaExhausted);
});

test("reusing a message id with a different payload recovers the secret exactly", async () => {
  const c = client(true);
  const seen: Violation[] = [];
  const v = verifier("search", (x) => void seen.push(x));
  for (let i = 0; i < 3; i++) {
    const r = await v.verifyHeader((await c.signRequest("search", payload(10 + i)))["x-quota-proof"], payload(10 + i));
    assert.equal(r.ok, true);
  }
  const r = await v.verifyHeader((await c.signRequest("search", payload(20)))["x-quota-proof"], payload(20));
  assert.deepEqual(r, { ok: false, reason: "violation" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].secret === SECRET, true); // compare without printing the secret
  assert.equal(seen[0].idCommitment, identityCommitment(SECRET));
});

test("the same message id on two servers never collides", async () => {
  const c = client();
  const seen: Violation[] = [];
  const a = verifier("server-a", (x) => void seen.push(x));
  const b = verifier("server-b", (x) => void seen.push(x));
  const pa = await c.prove("server-a", payload(30), 0n);
  const pb = await c.prove("server-b", payload(31), 0n);
  assert.notEqual(pa.nullifier, pb.nullifier);
  assert.notEqual(pa.externalNullifier, pb.externalNullifier);
  assert.equal((await a.verify(pa, payload(30))).ok, true);
  assert.equal((await b.verify(pb, payload(31))).ok, true);
  // A proof for server A is not accepted by server B.
  assert.deepEqual(await b.verify(pa, payload(30)), { ok: false, reason: "bad-external-nullifier" });
  assert.equal(seen.length, 0);
});

test("verifier rejects replay, wrong payload, unknown root, tampered signals, wrong epoch", async () => {
  const c = client();
  const v = verifier("search");
  const p = await c.prove("search", payload(40), 0n);
  assert.equal((await v.verify(p, payload(40))).ok, true);
  assert.deepEqual(await v.verify(p, payload(40)), { ok: false, reason: "replay" });
  assert.deepEqual(await verifier("search").verify(p, payload(41)), { ok: false, reason: "bad-payload" });

  const stale = new QuotaVerifier({ serverId: "search", vkey: artifacts.vkey, roots: { isKnownRoot: async () => false }, now: () => NOW });
  assert.deepEqual(await stale.verify(p, payload(40)), { ok: false, reason: "unknown-root" });

  const forged: QuotaProof = { ...p, y: p.y + 1n };
  assert.deepEqual(await verifier("search").verify(forged, payload(40)), { ok: false, reason: "invalid-proof" });

  const later = new QuotaVerifier({ serverId: "search", vkey: artifacts.vkey, roots, now: () => NOW + 3 * 3600 });
  assert.deepEqual(await later.verify(p, payload(40)), { ok: false, reason: "bad-epoch" });
  assert.deepEqual(await verifier("search").verifyHeader("garbage", payload(40)), { ok: false, reason: "malformed" });
});

test("client rejects a merkle proof for someone else's leaf and limits above the circuit range", async () => {
  const c = new QuotaClient({ secret: SECRET, limit: LIMIT, artifacts, merkleProof: () => tree.proof(0), now: () => NOW });
  await assert.rejects(c.prove("search", payload(50)), /not for this agent/);
  assert.throws(() => new QuotaClient({ secret: SECRET, limit: 65536n, artifacts, merkleProof: () => tree.proof(index) }), /limit/);
});
