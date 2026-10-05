/// Replace the rules of the existing agent policies with the current agentPolicyRules (identity rotation:
/// personal_sign allowed for messages starting with "QUOTA/rln-secret/v1").
import { fileURLToPath } from "node:url";
import { PrivyClient } from "@privy-io/node";
import type { Address } from "viem";
import { updateAgentPolicy } from "../src/privy.ts";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const privy = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const cap = BigInt(process.env.PRIVY_VALUE_CAP_WEI || "100000000000000000");
const targets = [
  { id: process.env.PRIVY_AGENT_POLICY_ID, registry: process.env.QUOTA_REGISTRY_ADDRESS as Address, chainId: 10143 },
  { id: process.env.PRIVY_DEV_AGENT_POLICY_ID, registry: (process.env.DEV_QUOTA_REGISTRY_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0") as Address, chainId: 31337 },
];
for (const t of targets) {
  if (!t.id) continue;
  const p = await updateAgentPolicy(privy, t.id, { registry: t.registry, chainId: t.chainId, valueCapWei: cap });
  console.log(`updated ${p.id}: ${(p as unknown as { rules: { name: string }[] }).rules.map((r) => r.name).join(" | ")}`);
}
process.exit(0);
