import { test } from "node:test";
import assert from "node:assert/strict";
import { Feed } from "../src/feed.ts";

test("feed keeps counts, a bounded newest-first row list, and only short public values", () => {
  const f = new Feed(3);
  f.result({ status: "verified", nullifier: 0x1234567890abcdefn, epoch: 1n, at: 1 });
  f.result({ status: "verified", nullifier: 2n, epoch: 1n, at: 2 });
  f.result({ status: "replay", nullifier: 3n, epoch: 1n, at: 3 });
  f.result({ status: "malformed", at: 4 });
  const s = f.snapshot();
  assert.deepEqual(s.counts, { verified: 2, replay: 1, malformed: 1 }); // counts are totals, not capped
  assert.equal(s.rows.length, 3);
  assert.deepEqual(s.rows.map((r) => r.status), ["malformed", "replay", "verified"]); // newest first, oldest dropped
  assert.equal(s.rows[0].nullifier, undefined);
  assert.equal(s.rows[1].nullifier, "0x00000003");
  assert.ok(/^0x[0-9a-f]{8}$/.test(s.rows[2].nullifier!));
});

test("feed records slashes with a shortened identity", () => {
  const f = new Feed();
  f.slash({ idCommitment: 0x123456789abcdef0123456789abcdefn, status: "slashed", commit: "0xaa", reveal: "0xbb" });
  const [s] = f.snapshot().slashes;
  assert.equal(s.status, "slashed");
  assert.equal(s.idCommitment, "0x123456…cdef");
  assert.equal(s.commit, "0xaa");
});
