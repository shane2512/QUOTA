/// Enroll identity n of the Privy agent wallet (PRD W1/W2). The Privy wallet is the operator; a SOFTWARE passkey
/// (TEST TOOLING, stands in for the operator's device) approves. Its key persists as DEMO_OPERATOR_PASSKEY in .env
/// because a registered passkey cannot be replaced, so losing it would lock the operator out.
///   pnpm --filter @quota/wallets exec tsx scripts/enroll-privy-agent.ts [--identity n] [--limit n] [--dev]
import { fileURLToPath } from "node:url";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, formatEther, http, type Address, type Hex } from "viem";
import { deriveSecret } from "@quota/client";
import { MemberState, identityCommitment, registryAbi } from "@quota/core";
import { Broadcaster, LocalKeyWallet } from "@quota/slasher";
import { enrollWithSoftPasskey } from "@quota/devtools";
import { operatorPasskey } from "./operator-passkey.ts";
import { PrivyAgentWallet } from "../src/index.ts";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
process.loadEnvFile(envPath);
const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : d;
};
const dev = process.argv.includes("--dev");
const identity = Number(arg("--identity", "0"));
const limit = BigInt(arg("--limit", "5"));
const fee = { maxFeePerGas: dev ? undefined : 120_000_000_000n };

const client = createPublicClient({ transport: http(process.env.MONAD_RPC_URL!) });
const registry = process.env.QUOTA_REGISTRY_ADDRESS as Address;
const privy = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const wallet = await PrivyAgentWallet.load(privy, process.env[dev ? "PRIVY_DEV_AGENT_WALLET_ID" : "PRIVY_AGENT_WALLET_ID"]!, process.env.PRIVY_AUTH_PRIVATE_KEY!);

const pk = operatorPasskey(envPath, process.env.WEBAUTHN_RP_ID!, dev);

const secret = await deriveSecret((m) => wallet.signMessage(m), identity); // via Privy; never printed
const id = identityCommitment(secret);
const m = (await client.readContract({ address: registry, abi: registryAbi, functionName: "members", args: [id] })) as { state: number; index: number };
if (m.state !== MemberState.None) {
  console.log(`identity ${identity} already used (state ${m.state}, index ${m.index}); use --identity ${identity + 1}`);
  process.exit(m.state === MemberState.Active ? 0 : 1);
}
const unit = (await client.readContract({ address: registry, abi: registryAbi, functionName: "UNIT" })) as bigint;
const r = await enrollWithSoftPasskey({
  client,
  registry,
  funder: new Broadcaster(client, new LocalKeyWallet(process.env.DEPLOYER_PRIVATE_KEY as Hex), fee),
  idCommitment: id,
  limit,
  rpId: process.env.WEBAUTHN_RP_ID!,
  operator: new Broadcaster(client, wallet, fee),
  operatorBalance: limit * unit + (dev ? 10n ** 18n : 450_000_000_000_000_000n), // stake + enroll gas limit × max fee + margin
  passkey: pk,
  log: (l) => console.log(`  ${l}`),
});
console.log(`privy wallet ${wallet.address} enrolled identity ${identity}: idCommitment ${id}, index ${r.index}, stake ${formatEther(r.stake)}`);
for (const t of r.txs) console.log(`${t.label.padEnd(16)} estimate ${t.sent.gasEstimate} limit ${t.sent.gasLimit} tx ${t.sent.hash}`);
process.exit(0);
