/// Live check of the operator console's server code on Monad testnet (registry v3), no browser involved.
/// Uses a throwaway Privy test user and a SOFTWARE passkey (test tooling, @quota/devtools), because a real passkey
/// needs a human tap on the public domain. It exercises: wallet creation (Privy user-owned wallet, our key quorum
/// as additional signer), identity derivation, relay of registerPasskey / enroll / topUp / requestUnstake, and the
/// refusals (stale assertion, duplicate enroll, oversize top-up, early unstake, bad login token).
///   pnpm --filter @quota/web exec tsx scripts/operator-e2e.mts
/// Spends about 0.9 MON from DEPLOYER_PRIVATE_KEY (most of it gas; the stake is withdrawable after the delay).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, formatEther, http, parseEther, type Address, type Hex } from "viem";
import { SoftPasskey, defaultOrigin } from "@quota/devtools";
import { Broadcaster, LocalKeyWallet } from "@quota/slasher";
import { Action, challenge, enrollParams, registerParams, unstakeParams } from "../lib/passkey-core.ts";
import { HttpError, authenticate, operatorState, relay, walletFor } from "../lib/operator-server.ts";
import { REGISTRY, monadTestnet } from "../lib/registry.ts";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const RP_ID = "quota-metro.vercel.app"; // the registry's immutable rpId
let failures = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
};
const expectError = async (label: string, status: number, fn: () => Promise<unknown>, contains?: string) => {
  try {
    await fn();
    ok(false, label, "no error");
  } catch (e) {
    const he = e instanceof HttpError ? e : undefined;
    ok(he?.status === status && (!contains || he.message.includes(contains)), label, he ? `${he.status} ${he.message}` : String(e).slice(0, 80));
  }
};

const chain = createPublicClient({ chain: monadTestnet, transport: http() });
const privy = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const email = process.env.OPERATOR_E2E_EMAIL || `quota-console-e2e-${Date.now()}@example.com`; // fresh user per run: a registered passkey cannot be replaced
const user = await privy.users().getByEmailAddress({ address: email }).catch(() => privy.users().create({ linked_accounts: [{ type: "email", address: email }] } as never));
const userId = user.id;

const sp = new SoftPasskey(RP_ID, defaultOrigin(RP_ID));
const wire = (a: { authenticatorData: Hex; clientDataJSON: string; r: bigint; s: bigint }) => ({ authenticatorData: a.authenticatorData, clientDataJSON: a.clientDataJSON, r: a.r.toString(), s: a.s.toString() });
const assertion = async (action: number, params: Hex) => {
  const st = await operatorState(userId);
  return wire(sp.assert(challenge({ chainId: st.chainId, registry: REGISTRY, operator: st.operator as Address, action, params, nonce: BigInt(st.passkey.nonce) })));
};
const agent = async (n: number) => (await operatorState(userId)).agents[n];

// ---- wallet
const s0 = await operatorState(userId);
const again = await walletFor(userId);
ok(again.address === s0.operator, "one wallet per user: a second lookup returns the same wallet", s0.operator);
ok(!s0.passkey.registered && s0.agents.length === 6 && s0.agents.every((a) => a.state === 0), "fresh operator: no passkey, 6 free identity slots");
ok(new Set(s0.agents.map((a) => a.idCommitment)).size === 6, "six distinct identity commitments derived from the wallet");
writeFileSync(fileURLToPath(new URL("../../../.operator-e2e-user", import.meta.url)), `${userId}\n`); // id only, for withdrawing later

// ---- fund the wallet from the deployer, then wait for Monad's lagging balance check
const funder = new Broadcaster(chain, new LocalKeyWallet(process.env.DEPLOYER_PRIVATE_KEY as Hex));
if (BigInt(s0.balanceWei) < parseEther("0.9")) {
  const f = await funder.send(s0.operator as Address, "0x", parseEther("0.9") - BigInt(s0.balanceWei));
  const target = f.receipt.blockNumber + 6n;
  while ((await chain.getBlockNumber()) < target) await new Promise((r) => setTimeout(r, 500));
}
console.log(`operator wallet ${s0.operator} holds ${formatEther(await chain.getBalance({ address: s0.operator as Address }))} MON`);

// ---- refusals that need no funds or passkey
await expectError("login token: missing header is refused", 401, () => authenticate(new Request("http://x")));
await expectError("login token: garbage token is refused", 401, () => authenticate(new Request("http://x", { headers: { authorization: "Bearer not-a-token" } })));

// ---- passkey registration (custody key)
const reg = await relay(userId, { action: "registerPasskey", x: sp.x.toString(), y: sp.y.toString(), assertion: await assertion(Action.RegisterPasskey, registerParams(sp.x, sp.y)) });
const s1 = await operatorState(userId);
ok(s1.passkey.registered && s1.passkey.nonce === "1" && s1.passkey.x === sp.x.toString(), "registerPasskey relayed; key stored, nonce 1", reg.hash.slice(0, 12));
await new Promise((r) => setTimeout(r, 3000)); // the relay's per-user spacing

// ---- enroll agent 0 (limit 1)
const id0 = BigInt(s1.agents[0].idCommitment);
const enrollAssertion = await assertion(Action.Enroll, enrollParams(id0, 1n, 0n, BigInt(s1.unitWei)));
const en = await relay(userId, { action: "enroll", identity: 0, limit: 1, assertion: enrollAssertion });
const a0 = await agent(0);
ok(a0.state === 1 && a0.limit === 1 && a0.stakeWei === s1.unitWei, "enroll relayed; agent 0 Active, limit 1, stake = 1 unit", en.hash.slice(0, 12));
await new Promise((r) => setTimeout(r, 3000));

await expectError("replayed assertion (stale nonce, other identity) is rejected by the registry", 422, () => relay(userId, { action: "enroll", identity: 1, limit: 1, assertion: enrollAssertion }), "ChallengeMismatch");
await new Promise((r) => setTimeout(r, 3000));
await expectError("enrolling an already-enrolled identity is refused", 409, () => relay(userId, { action: "enroll", identity: 0, limit: 1, assertion: enrollAssertion }));
await new Promise((r) => setTimeout(r, 3000));

// ---- top up (no passkey needed: adding stake is harmless)
const tu = await relay(userId, { action: "topUp", identity: 0, amountWei: parseEther("0.05").toString() });
const a0b = await agent(0);
ok(BigInt(a0b.stakeWei) === BigInt(s1.unitWei) + parseEther("0.05"), "topUp relayed; stake increased by 0.05 MON", tu.hash.slice(0, 12));
await new Promise((r) => setTimeout(r, 3000));
await expectError("top-up above 1 MON is refused", 400, () => relay(userId, { action: "topUp", identity: 0, amountWei: parseEther("1.5").toString() }));
await new Promise((r) => setTimeout(r, 3000));

// ---- unstake: passkey-bound destination
const dest = new LocalKeyWallet(process.env.DEPLOYER_PRIVATE_KEY as Hex).address;
const ru = await relay(userId, { action: "requestUnstake", identity: 0, destination: dest, assertion: await assertion(Action.RequestUnstake, unstakeParams(id0, dest)) });
const a0c = await agent(0);
ok(a0c.state === 2 && a0c.destination.toLowerCase() === dest.toLowerCase() && a0c.unlockAt > (await operatorState(userId)).now, "requestUnstake relayed; agent 0 Unstaking, destination bound, unlock in the future", ru.hash.slice(0, 12));
await new Promise((r) => setTimeout(r, 3000));
await expectError("unstake before the delay is refused", 409, () => relay(userId, { action: "unstake", identity: 0 }), "delay");

console.log(`\nunlock at ${new Date(a0c.unlockAt * 1000).toISOString()}; then: relay {action:"unstake", identity:0} for user ${userId} pays ${dest}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
