/// Phase 2 exit check. Run: pnpm --filter @quota/server phase2
/// 1. Rebuild the tree from live registry events and compare to the on-chain root (hashing compatibility).
/// 2. Honest requests verify; message-id reuse recovers the secret; per-server nullifiers do not collide.
/// 3. Measure proof generation and verification time.
import { cpus } from "node:os";
import { createPublicClient, http, type Address } from "viem";
import { QuotaClient } from "@quota/client";
import {
  identityCommitment,
  loadArtifacts,
  rateCommitment,
  registryAbi,
  syncTree,
  verifyMerkleProof,
} from "@quota/core";
import { QuotaVerifier, RegistryRootChecker, type Violation } from "../src/index.ts";

const RPC = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const REGISTRY = (process.env.QUOTA_REGISTRY_ADDRESS || "0x05a5fe209E19C6707e2E701A76A0C94b2351E0ac") as Address;
const DEPLOY_BLOCK = BigInt(process.env.QUOTA_REGISTRY_BLOCK || 0x40c26dd); // registry v1 deploy (contracts/broadcast)

const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
};
const payload = (i: number) => (`0x${i.toString(16).padStart(64, "0")}`) as `0x${string}`;
const ms = (t0: bigint) => Number(process.hrtime.bigint() - t0) / 1e6;
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `median ${s[Math.floor(s.length / 2)].toFixed(0)} ms, min ${s[0].toFixed(0)}, max ${s[s.length - 1].toFixed(0)} (n=${s.length})`;
};

async function main() {
  // ---- 1. live registry compatibility
  const chain = createPublicClient({ transport: http(RPC) });
  const read = (functionName: "root" | "depth" | "numberOfLeaves") =>
    chain.readContract({ address: REGISTRY, abi: registryAbi, functionName }) as Promise<bigint>;
  const t0 = process.hrtime.bigint();
  const { tree: live, toBlock } = await syncTree(chain, REGISTRY, { fromBlock: DEPLOY_BLOCK });
  const syncMs = ms(t0);
  const [root, depth, leaves] = await Promise.all([
    chain.readContract({ address: REGISTRY, abi: registryAbi, functionName: "root", blockNumber: toBlock }) as Promise<bigint>,
    read("depth"),
    read("numberOfLeaves"),
  ]);
  console.log(`registry ${REGISTRY} @ block ${toBlock}: depth ${depth}, leaves ${leaves}; synced ${Number(toBlock - DEPLOY_BLOCK + 1n)} blocks in ${syncMs.toFixed(0)} ms`);
  ok(depth === 20n, "registry depth = circuit depth 20");
  ok(BigInt(live.size) === leaves, `off-chain leaf count ${live.size} = on-chain ${leaves}`);
  ok(live.root === root, `off-chain root = on-chain root (${root.toString(16).slice(0, 12)}…)`);
  const roots = new RegistryRootChecker(chain, REGISTRY);
  ok(await roots.isKnownRoot(live.root), "registry.isKnownRoot(off-chain root)");
  for (let i = 0; i < live.size; i++) ok(verifyMerkleProof(live.proof(i)), `merkle proof for on-chain leaf ${i}`);

  // ---- 2. protocol checks: a test member appended to a copy of the live tree.
  // The secret of the on-chain leaf is unknown (the Phase 1 tool used a random idCommitment), so this
  // member is local only: the root below is NOT on-chain. Enrolling it needs a passkey assertion.
  const artifacts = loadArtifacts();
  const secret = BigInt(`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString("hex")}`);
  const limit = 3n;
  const index = live.insert(rateCommitment(identityCommitment(secret), limit));
  const localRoots = { isKnownRoot: async (r: bigint) => r === live.root };
  const now = () => 1_790_000_000;
  const mk = (allowOveruse = false) =>
    new QuotaClient({ secret, limit, artifacts, merkleProof: () => live.proof(index), now, allowOveruse });
  const violations: Violation[] = [];
  const mkv = (serverId: string) =>
    new QuotaVerifier({ serverId, vkey: artifacts.vkey, roots: localRoots, now, onViolation: (v) => void violations.push(v) });

  const agent = mk(true);
  const search = mkv("search.quota.test");
  const proveTimes: number[] = [];
  const verifyTimes: number[] = [];
  for (let i = 0; i < 3; i++) {
    let t = process.hrtime.bigint();
    const h = await agent.signRequest("search.quota.test", payload(i));
    proveTimes.push(ms(t));
    t = process.hrtime.bigint();
    const r = await search.verifyHeader(h["x-quota-proof"], payload(i));
    verifyTimes.push(ms(t));
    ok(r.ok, `honest request ${i + 1}/3 verifies`);
  }
  const r4 = await search.verifyHeader((await agent.signRequest("search.quota.test", payload(99)))["x-quota-proof"], payload(99));
  ok(!r4.ok && r4.reason === "violation", "4th request reuses message id 0 → violation");
  ok(violations.length === 1 && violations[0].secret === secret, "recovered secret equals a0 exactly (value not printed)");
  ok(violations[0]?.idCommitment === identityCommitment(secret), "Poseidon(recovered) = member idCommitment");

  violations.length = 0;
  const honest = mk();
  const a = mkv("server-a"), b = mkv("server-b");
  const pa = await honest.prove("server-a", payload(200), 0n);
  const pb = await honest.prove("server-b", payload(201), 0n);
  ok((await a.verify(pa, payload(200))).ok && (await b.verify(pb, payload(201))).ok, "message id 0 accepted on server-a and server-b");
  ok(pa.nullifier !== pb.nullifier && violations.length === 0, "different nullifiers per server, no false violation");
  const cross = await b.verify(pa, payload(200));
  ok(!cross.ok && cross.reason === "bad-external-nullifier", "server-b rejects a proof made for server-a");

  // ---- 3. benchmark
  for (let i = 0; i < 7; i++) {
    let t = process.hrtime.bigint();
    const p = await honest.prove("bench", payload(1000 + i), BigInt(i % 3));
    proveTimes.push(ms(t));
    t = process.hrtime.bigint();
    await mkv("bench").verify(p, payload(1000 + i));
    verifyTimes.push(ms(t));
  }
  console.log(`\nmachine: ${cpus()[0].model}, ${cpus().length} cores, node ${process.version}`);
  console.log(`proof generation (snarkjs groth16.fullProve, depth 20): ${stats(proveTimes)}`);
  console.log(`proof verification (snarkjs groth16.verify, incl. checks):  ${stats(verifyTimes)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
  });
