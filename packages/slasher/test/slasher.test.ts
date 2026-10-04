import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { identityCommitment } from "@quota/core";
import { Slasher, slashCommitment, type SubmitPath } from "../src/index.ts";

test("slashCommitment equals Solidity keccak256(abi.encode(a0, receiver, salt))", () => {
  const a0 = 0xc0ffeen;
  const receiver = "0x0000000000000000000000000000000000005ea5";
  const salt = `0x${"11".repeat(32)}` as const;
  let castOut: string | undefined;
  try {
    const enc = execFileSync("cast", ["abi-encode", "f(uint256,address,bytes32)", a0.toString(), receiver, salt], { encoding: "utf8" }).trim();
    castOut = execFileSync("cast", ["keccak", enc], { encoding: "utf8" }).trim();
  } catch {
    // cast not on PATH: the pinned vector below still checks the encoding
  }
  const pinned = "0x893f129c1d2ac1bd375f4778c498d91199c3743769fb8f80a4cb0319147013a4"; // cast 1.8.4
  if (castOut) assert.equal(castOut, pinned);
  assert.equal(slashCommitment(a0, receiver, salt), pinned);
});

function fakeSlasher(calls: bigint[]) {
  const path: SubmitPath = {
    name: "fake",
    slash: async (req) => {
      calls.push(req.secret);
      throw new Error("no chain in unit test");
    },
  };
  // client.readContract returns an Active member; nothing else is touched before path.slash
  const client = { readContract: async () => ({ state: 1, index: 0, limit: 1n }) } as never;
  return new Slasher({ client, registry: "0x0000000000000000000000000000000000000001", path, broadcaster: {} as never, receiver: "0x0000000000000000000000000000000000000002" });
}

test("slasher rejects a secret that does not match the idCommitment", async () => {
  const calls: bigint[] = [];
  const s = fakeSlasher(calls);
  const o = await s.enqueue({ secret: 5n, idCommitment: identityCommitment(6n) });
  assert.equal(o.status, "failed");
  assert.equal(calls.length, 0);
});

test("slasher dedupes concurrent violations for one secret, and allows a retry after failure", async () => {
  const calls: bigint[] = [];
  const s = fakeSlasher(calls);
  const v = { secret: 7n, idCommitment: identityCommitment(7n) };
  const [a, b] = await Promise.all([s.enqueue(v), s.enqueue(v)]);
  assert.equal(a.status, "failed"); // fake path throws
  assert.deepEqual(b, { status: "skipped", idCommitment: v.idCommitment, reason: "duplicate" });
  assert.equal(calls.length, 1);
  const c = await s.enqueue(v); // failure released the secret for a retry
  assert.equal(c.status, "failed");
  assert.equal(calls.length, 2);
});
