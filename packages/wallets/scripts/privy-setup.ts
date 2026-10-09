/// Create the Privy operator user, override policy and agent wallet (PRD W1). Writes ids (not secrets) to ../../.env.
///   pnpm --filter @quota/wallets exec tsx scripts/privy-setup.ts          → Monad testnet, QUOTA_REGISTRY_ADDRESS
///   pnpm --filter @quota/wallets exec tsx scripts/privy-setup.ts --dev    → local anvil (chain 31337, dev registry)
///   add --replace to supersede an existing wallet (old ids stay in .env as comments)
import { fileURLToPath } from "node:url";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { PrivyClient } from "@privy-io/node";
import type { Address } from "viem";
import { createAgentWallet } from "../src/privy.ts";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
process.loadEnvFile(envPath);
const dev = process.argv.includes("--dev");
const prefix = dev ? "PRIVY_DEV_AGENT" : "PRIVY_AGENT";
// --replace: keep the old ids as comments ("# superseded ...") and create a new user/policy/wallet set
if (new RegExp(`^${prefix}_WALLET_ID=.`, "m").test(readFileSync(envPath, "utf8"))) {
  if (!process.argv.includes("--replace")) throw new Error(`${prefix}_WALLET_ID already set (use --replace)`);
  const text = readFileSync(envPath, "utf8").replace(new RegExp(`^(${prefix}_(USER|POLICY|WALLET)_ID=)`, "gm"), "# superseded $1");
  writeFileSync(envPath, text);
  for (const k of ["USER_ID", "POLICY_ID", "WALLET_ID"]) delete process.env[`${prefix}_${k}`];
}

const registry = (dev ? process.env.DEV_QUOTA_REGISTRY_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" : process.env.QUOTA_REGISTRY_ADDRESS) as Address;
const chainId = dev ? 31337 : 10143;
const privy = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const r = await createAgentWallet(privy, {
  operatorEmail: process.env.PRIVY_OPERATOR_EMAIL || (dev ? "quota-operator-dev@example.com" : "quota-operator@example.com"),
  signerQuorumId: process.env.PRIVY_AUTH_KEY_QUORUM_ID!,
  registry,
  chainId,
  valueCapWei: BigInt(process.env.PRIVY_VALUE_CAP_WEI || "1000000000000000000"), // 1 MON: enough stake for limit 10 at the v3 UNIT of 0.1
  label: dev ? "QUOTA dev" : "QUOTA",
});
console.log(JSON.stringify({ ...r, registry, chainId }, null, 2));
appendFileSync(
  envPath,
  `\n# Phase 5: Privy agent wallet (${dev ? "anvil dev" : "Monad testnet"}); ids only\n${prefix}_USER_ID=${r.userId}\n${prefix}_POLICY_ID=${r.policyId}\n${prefix}_WALLET_ID=${r.walletId}\n`,
);
process.exit(0);
