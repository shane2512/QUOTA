import { after, test } from "node:test";
import assert from "node:assert/strict";
import { QuotaClient } from "@quota/client";
import { SparseMerkleTree, identityCommitment, loadArtifacts, rateCommitment } from "@quota/core";
import { QuotaVerifier, type VerifyEvent } from "../src/index.ts";

// The service console's live feed is built on QuotaVerifierOptions.onResult.
const artifacts = loadArtifacts();
const NOW = 1_790_000_000;
const SECRET = 0x5eed_5eed_5eed_5eedn;
const tree = new SparseMerkleTree(20);
const index = tree.insert(rateCommitment(identityCommitment(SECRET), 3n));
const roots = { isKnownRoot: async (r: bigint) => r === tree.root };
const payload = (i: number) => (`0x${i.toString(16).padStart(64, "0")}`) as `0x${string}`;

after(async () => {
  await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
});

test("onResult reports ok, replay and violation (with nullifier and epoch, never the secret) and rejections", async () => {
  const events: VerifyEvent[] = [];
  const v = new QuotaVerifier({ serverId: "feed", vkey: artifacts.vkey, roots, now: () => NOW, onResult: (e) => void events.push(e) });
  const c = new QuotaClient({ secret: SECRET, limit: 3n, artifacts, merkleProof: () => tree.proof(index), now: () => NOW, allowOveruse: true });

  const h0 = (await c.signRequest("feed", payload(1)))["x-quota-proof"];
  assert.equal((await v.verifyHeader(h0, payload(1))).ok, true);
  assert.deepEqual((await v.verifyHeader(h0, payload(1))), { ok: false, reason: "replay" });
  await v.verifyHeader("not-a-proof", payload(1));
  const bad = (await c.signRequest("feed", payload(2)))["x-quota-proof"];
  await v.verifyHeader(bad, payload(99)); // tampered payload
  // a different request reusing message id 0 of the same epoch is a violation
  const c2 = new QuotaClient({ secret: SECRET, limit: 3n, artifacts, merkleProof: () => tree.proof(index), now: () => NOW, allowOveruse: true });
  assert.equal(((await v.verifyHeader((await c2.signRequest("feed", payload(3)))["x-quota-proof"], payload(3))) as { reason?: string }).reason, "violation");

  assert.deepEqual(events.map((e) => e.status), ["verified", "replay", "malformed", "bad-payload", "violation"]);
  assert.equal(typeof events[0].nullifier, "bigint");
  assert.equal(events[0].epoch, BigInt(Math.floor(NOW / 3600)));
  assert.equal(events[2].nullifier, undefined); // malformed header: nothing to report
  for (const e of events) assert.equal(JSON.stringify(e, (_k, x) => (typeof x === "bigint" ? x.toString() : x)).includes(SECRET.toString()), false);
});
