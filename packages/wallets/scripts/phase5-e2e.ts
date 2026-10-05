/// Phase 5 exit check: Privy on the agent side, Dynamic on the service side.
///   1. The Privy agent wallet is the operator: registers a passkey (software P-256, test tooling) and enrolls,
///      every transaction signed by Privy under the override policy, broadcast by us.
///   2. The agent's RLN secret is derived from a Privy personal_sign (deterministic, policy-allowed).
///   3. Honest RLN requests verify against the on-chain root.
///   4. (unless --no-slash) The agent cheats; the server recovers the secret; the slasher commits and reveals
///      with the Dynamic server wallet, and the reward lands in that Dynamic wallet.
/// Env (../../.env; shell wins): MONAD_RPC_URL, QUOTA_REGISTRY_ADDRESS, DEPLOYER_PRIVATE_KEY (funder only),
///   PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTH_PRIVATE_KEY, PRIVY_AGENT_WALLET_ID (or PRIVY_DEV_AGENT_WALLET_ID with --dev),
///   DYNAMIC_ENVIRONMENT_ID, DYNAMIC_API_TOKEN, DYNAMIC_SLASHER_WALLET, DYNAMIC_WALLET_PASSWORD, WEBAUTHN_RP_ID.
/// Run: pnpm --filter @quota/wallets exec tsx scripts/phase5-e2e.ts [--dev] [--no-slash]
import { fileURLToPath } from "node:url";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, formatEther, http, type Address, type Hex } from "viem";
import { QuotaClient, deriveSecret } from "@quota/client";
import { MemberState, fetchTree, identityCommitment, loadArtifacts, registryAbi } from "@quota/core";
import { QuotaVerifier, RegistryRootChecker, type Violation } from "@quota/server";
import { Broadcaster, CommitRevealPath, LocalKeyWallet, Slasher, type Sent } from "@quota/slasher";
import { enrollWithSoftPasskey } from "@quota/devtools";
import { DynamicServiceWallet, PrivyAgentWallet } from "../src/index.ts";
import { operatorPasskey } from "./operator-passkey.ts";

process.loadEnvFile?.(fileURLToPath(new URL("../../../.env", import.meta.url)));
const dev = process.argv.includes("--dev");
const slash = !process.argv.includes("--no-slash");
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
  return cond;
};
const payload = (i: number) => (`0x${(0xe5e5_0000 + i).toString(16).padStart(64, "0")}`) as Hex;
const MON = (x: number) => BigInt(Math.round(x * 1e6)) * 1_000_000_000_000n;

const client = createPublicClient({ transport: http(need("MONAD_RPC_URL")) });
const registry = need("QUOTA_REGISTRY_ADDRESS") as Address;
const chainId = await client.getChainId();
const fee = { maxFeePerGas: dev ? undefined : 120_000_000_000n }; // Monad: base ~100 gwei; a lower cap lowers the up-front balance check
const read = <T>(functionName: string, args: readonly unknown[] = []) =>
  client.readContract({ address: registry, abi: registryAbi, functionName, args } as never) as Promise<T>;
const gasLog: string[] = [];
const note = (label: string, s: Sent) => void gasLog.push(`${label.padEnd(16)} estimate ${s.gasEstimate}  limit ${s.gasLimit}  tx ${s.hash}`);

console.log(`chain ${chainId}, registry ${registry}, mode ${dev ? "anvil dev" : "Monad testnet"}${slash ? "" : ", no slash"}`);
const funder = new Broadcaster(client, new LocalKeyWallet(need("DEPLOYER_PRIVATE_KEY") as Hex), fee);

// ---- agent side: Privy
const privy = new PrivyClient({ appId: need("PRIVY_APP_ID"), appSecret: need("PRIVY_APP_SECRET") });
const agentWallet = await PrivyAgentWallet.load(privy, need(dev ? "PRIVY_DEV_AGENT_WALLET_ID" : "PRIVY_AGENT_WALLET_ID"), need("PRIVY_AUTH_PRIVATE_KEY"));
const agentTx = new Broadcaster(client, agentWallet, fee);
console.log(`privy agent wallet ${agentWallet.address}`);
const IDENTITY = Number(process.env.E2E_IDENTITY || 0);
const secret = await deriveSecret((m) => agentWallet.signMessage(m), IDENTITY); // via Privy; never printed
const again = await deriveSecret((m) => agentWallet.signMessage(m), IDENTITY);
ok(secret === again, "agent secret derived from a Privy signature, stable across calls");
const id = identityCommitment(secret);

const LIMIT = BigInt(process.env.E2E_LIMIT || 5); // at UNIT 0.1 MON a 5-message stake (0.5) makes the 50% reward exceed slash gas
let member = await read<{ state: number; index: number; limit: bigint; stake: bigint }>("members", [id]);
if (member.state === MemberState.None) {
  const unit = await read<bigint>("UNIT");
  const r = await enrollWithSoftPasskey({
    client,
    registry,
    funder,
    idCommitment: id,
    limit: LIMIT,
    rpId: need("WEBAUTHN_RP_ID"),
    operator: agentTx,
    passkey: operatorPasskey(fileURLToPath(new URL("../../../.env", import.meta.url)), need("WEBAUTHN_RP_ID"), dev),
    operatorBalance: LIMIT * unit + MON(dev ? 1 : 0.45), // stake + gas limit × max fee (enroll ~2.3M × 120 gwei ≈ 0.28) + margin
    log: (l) => console.log(`  ${l}`),
  });
  for (const t of r.txs) note(t.label, t.sent);
  member = await read("members", [id]);
}
ok(member.state === MemberState.Active, `agent enrolled by the Privy wallet as operator (index ${member.index}, limit ${member.limit})`);

// ---- service side: verifier (+ Dynamic slasher)
const tree = await fetchTree(client, registry);
const agent = new QuotaClient({ secret, limit: member.limit, artifacts: loadArtifacts(), merkleProof: () => tree.proof(member.index), allowOveruse: true });
const violations: Violation[] = [];
let slasher: Slasher | undefined;
let dynamic: DynamicServiceWallet | undefined;
if (slash) {
  dynamic = await DynamicServiceWallet.connect({
    environmentId: need("DYNAMIC_ENVIRONMENT_ID"),
    apiToken: need("DYNAMIC_API_TOKEN"),
    metadataB64: need("DYNAMIC_SLASHER_WALLET"),
    password: need("DYNAMIC_WALLET_PASSWORD"),
  });
  console.log(`dynamic slasher wallet ${dynamic.address}`);
  dynamic.onRetry = (n, err) => console.log(`  dynamic sign attempt ${n} failed (${err.slice(0, 80)}); retrying`);
  const dynTx = new Broadcaster(client, dynamic, fee);
  const needed = MON(dev ? 1 : 0.36);
  const have = await client.getBalance({ address: dynamic.address });
  if (have < needed) {
    const f = await funder.send(dynamic.address, "0x", needed - have);
    note("fund dynamic", f);
    while ((await client.getBlockNumber()) < f.receipt.blockNumber + 4n) await new Promise((r) => setTimeout(r, 400));
  }
  slasher = new Slasher({ client, registry, path: new CommitRevealPath(dynTx, registry), broadcaster: dynTx, receiver: dynamic.address });
}
const outcomes: ReturnType<Slasher["enqueue"]>[] = [];
const server = new QuotaVerifier({
  serverId: "phase5.quota",
  vkey: loadArtifacts().vkey,
  roots: new RegistryRootChecker(client, registry),
  onViolation: (v) => {
    violations.push(v);
    if (slasher) outcomes.push(slasher.enqueue(v));
  },
});

for (let i = 0; i < Number(member.limit); i++) {
  const p = await agent.prove("phase5.quota", payload(i));
  const r = await server.verify(p, payload(i));
  ok(r.ok, `honest request ${i + 1}/${member.limit} verified against the on-chain root`);
}
const cheat = await server.verify(await agent.prove("phase5.quota", payload(99)), payload(99));
ok(!cheat.ok && cheat.reason === "violation", "next request reuses a message id → violation, secret recovered");
ok(violations[0]?.secret === secret, "recovered secret equals the Privy-derived secret (not printed)");

if (slasher && dynamic) {
  const before = await client.getBalance({ address: dynamic.address });
  const o = await outcomes[0];
  if (o.status !== "slashed") {
    ok(false, `slash: ${o.status} ${"reason" in o ? o.reason : "error" in o ? o.error : ""}`);
  } else {
    note("commitSlash", o.result.commit);
    note("revealSlash", o.result.reveal);
    const after = await client.getBalance({ address: dynamic.address });
    const share = await read<bigint>("SLASH_SHARE_BPS");
    const reward = (member.stake * share) / 10_000n;
    const fees = o.result.commit.receipt.gasUsed * o.result.commit.receipt.effectiveGasPrice + o.result.reveal.receipt.gasUsed * o.result.reveal.receipt.effectiveGasPrice;
    ok(after - before + fees === reward, `Dynamic wallet received ${formatEther(reward)} (balance change ${formatEther(after - before)} after ${formatEther(fees)} gas)`);
    console.log(`slasher net: reward ${formatEther(reward)} − gas ${formatEther(fees)} = ${formatEther(reward - fees)} MON (${reward > fees ? "profitable" : "LOSS"})`);
    const m2 = await read<{ state: number }>("members", [id]);
    ok(m2.state === MemberState.Slashed, "member Slashed; commit and reveal signed by Dynamic, broadcast by us");
  }
}
console.log("\n" + gasLog.join("\n"));
process.exit(process.exitCode ?? 0);
