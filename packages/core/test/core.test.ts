import { test } from "node:test";
import assert from "node:assert/strict";
import { poseidon2 } from "poseidon-lite";
import {
  SNARK_FIELD,
  SparseMerkleTree,
  decodeProof,
  encodeProof,
  externalNullifier,
  hashToField,
  loadArtifacts,
  mod,
  recoverSecret,
  verifyMerkleProof,
} from "../src/index.ts";

test("empty tree root is the depth-20 zero hash chain", () => {
  const t = new SparseMerkleTree(20);
  let z = 0n;
  for (let i = 0; i < 20; i++) z = poseidon2([z, z]);
  assert.equal(t.root, z);
});

test("proofs verify for every leaf, including after removal", () => {
  const t = new SparseMerkleTree(20);
  for (let i = 1n; i <= 5n; i++) t.insert(i * 1000n);
  for (let i = 0; i < 5; i++) assert.ok(verifyMerkleProof(t.proof(i)));
  t.set(2, 0n); // removal, as LeafSet(index, 0)
  assert.equal(t.leaf(2), 0n);
  for (const i of [0, 1, 3, 4]) assert.ok(verifyMerkleProof(t.proof(i)));
  const p = t.proof(3);
  assert.ok(!verifyMerkleProof({ ...p, leaf: p.leaf + 1n }));
});

test("small-depth root matches a hand-computed root", () => {
  const t = new SparseMerkleTree(2);
  t.insert(7n);
  t.insert(9n);
  t.insert(11n);
  const expected = poseidon2([poseidon2([7n, 9n]), poseidon2([11n, 0n])]);
  assert.equal(t.root, expected);
});

test("tree rejects gaps", () => {
  const t = new SparseMerkleTree(4);
  assert.throws(() => t.set(1, 5n), /gap/);
});

test("two shares on one line recover the secret; same x is rejected", () => {
  const a0 = 123456789n;
  const a1 = 987654321n;
  const share = (x: bigint) => mod(a0 + a1 * x);
  assert.equal(recoverSecret(5n, share(5n), 9n, share(9n)), a0);
  const bigX = SNARK_FIELD - 3n;
  assert.equal(recoverSecret(bigX, share(bigX), 2n, share(2n)), a0);
  assert.throws(() => recoverSecret(5n, share(5n), 5n, share(5n)));
});

test("external nullifier differs per server and per epoch", () => {
  const a = externalNullifier("search.example", 1n);
  assert.notEqual(a, externalNullifier("weather.example", 1n));
  assert.notEqual(a, externalNullifier("search.example", 2n));
  assert.equal(a, externalNullifier("search.example", 1n));
});

test("hashToField stays inside the field", () => {
  for (const s of ["", "a", "0x" + "ff".repeat(32)]) assert.ok(hashToField(s) < SNARK_FIELD);
});

test("proof header round-trips", () => {
  const p = {
    proof: { pi_a: ["1", "2", "1"], pi_b: [["1", "2"], ["3", "4"], ["1", "0"]], pi_c: ["5", "6", "1"], protocol: "groth16", curve: "bn128" },
    y: 1n, root: 2n, nullifier: 3n, x: 4n, externalNullifier: 5n, epoch: 6n,
  };
  assert.deepEqual(decodeProof(encodeProof(p)), p);
  assert.throws(() => decodeProof("not-base64-json"));
});

test("vendored artifacts match pinned checksums and are RLN-v2 (5 public signals)", () => {
  const a = loadArtifacts();
  assert.equal((a.vkey as { nPublic: number }).nPublic, 5);
  assert.equal((a.vkey as { protocol: string }).protocol, "groth16");
});
