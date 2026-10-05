/// Live Privy policy check (PRD W1 negative tests). Sign-only: nothing is broadcast.
/// Our runtime key may sign only: registry txs on the policy's chain with value ≤ cap, and the RLN-secret message.
///   pnpm --filter @quota/wallets exec tsx scripts/privy-policy-check.ts [--dev]
import { fileURLToPath } from "node:url";
import { PrivyClient } from "@privy-io/node";
import { encodeFunctionData, recoverMessageAddress, recoverTransactionAddress, type Address, type Hex, type TransactionSerializable } from "viem";
import { SECRET_MESSAGE } from "@quota/client";
import { registryAbi } from "@quota/core";
import { PrivyAgentWallet } from "../src/privy.ts";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const dev = process.argv.includes("--dev");
const walletId = (dev ? process.env.PRIVY_DEV_AGENT_WALLET_ID : process.env.PRIVY_AGENT_WALLET_ID)!;
const registry = (dev ? process.env.DEV_QUOTA_REGISTRY_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" : process.env.QUOTA_REGISTRY_ADDRESS) as Address;
const chainId = dev ? 31337 : 10143;

const privy = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const w = await PrivyAgentWallet.load(privy, walletId, process.env.PRIVY_AUTH_PRIVATE_KEY!);
const info = (await privy.wallets().get(walletId)) as unknown as { owner_id?: string; additional_signers?: { signer_id: string; override_policy_ids?: string[] }[]; policy_ids?: string[] };
console.log(`wallet ${w.address} owner ${info.owner_id} additional signers ${JSON.stringify(info.additional_signers)} base policies ${JSON.stringify(info.policy_ids)}`);

let failures = 0;
const check = async (label: string, expectAllowed: boolean, fn: () => Promise<unknown>) => {
  let allowed = true;
  let detail = "";
  try {
    detail = String(await fn());
  } catch (e) {
    allowed = false;
    detail = (e as Error).message.replace(/\s+/g, " ").slice(0, 140);
  }
  const ok = allowed === expectAllowed;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${allowed ? "signed" : "rejected"} ${detail ? `(${detail})` : ""}`);
};

const topUp = encodeFunctionData({ abi: registryAbi, functionName: "commitSlash", args: [`0x${"11".repeat(32)}`] });
const tx = (over: Partial<TransactionSerializable>): TransactionSerializable =>
  ({ type: "eip1559", chainId, nonce: 0, to: registry, data: topUp, value: 0n, gas: 100_000n, maxFeePerGas: 200_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, ...over }) as TransactionSerializable;
const signer = async (t: TransactionSerializable) => recoverTransactionAddress({ serializedTransaction: (await w.signTransaction(t)) as `0x02${string}` });

const sigs: Hex[] = [];
await check("personal_sign(QUOTA/rln-secret/v1) #1", true, async () => {
  const s = await w.signMessage(SECRET_MESSAGE);
  sigs.push(s);
  return `signer ${await recoverMessageAddress({ message: SECRET_MESSAGE, signature: s })}`;
});
for (const i of [2, 3]) await check(`personal_sign(QUOTA/rln-secret/v1) #${i}`, true, async () => void sigs.push(await w.signMessage(SECRET_MESSAGE)));
console.log(`${sigs.length === 3 && sigs.every((s) => s === sigs[0]) ? "PASS" : "FAIL"}  deterministic: 3 signatures identical`);
if (!(sigs.length === 3 && sigs.every((s) => s === sigs[0]))) failures++;

await check("personal_sign(QUOTA/rln-secret/v1/1) (identity rotation)", true, async () => `signer ${await recoverMessageAddress({ message: "QUOTA/rln-secret/v1/1", signature: await w.signMessage("QUOTA/rln-secret/v1/1") })}`);
await check("personal_sign(other message)", false, () => w.signMessage("transfer everything"));
await check(`signTransaction → registry, chain ${chainId}, value 0.03`, true, async () => `signer ${await signer(tx({ value: 30_000_000_000_000_000n }))}`);
await check("signTransaction → other contract", false, () => signer(tx({ to: "0x000000000000000000000000000000000000dEaD" })));
await check("signTransaction → registry, value 0.2 (over 0.1 cap)", false, () => signer(tx({ value: 200_000_000_000_000_000n })));
await check("signTransaction → registry, other chain", false, () => signer(tx({ chainId: dev ? 10143 : 1 })));

console.log(failures === 0 ? "\nall policy checks passed" : `\n${failures} policy check(s) FAILED`);
process.exit(failures ? 1 : 0);
