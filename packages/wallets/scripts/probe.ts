/// Read-only probe of the Privy and Dynamic credentials in ../../.env. Prints ids and addresses only, never secrets.
import { fileURLToPath } from "node:url";
import { PrivyClient } from "@privy-io/node";
import { dynamicEvmClient } from "../src/dynamic-sdk.ts";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const env = (k: string) => process.env[k] ?? "";

const privy = new PrivyClient({ appId: env("PRIVY_APP_ID"), appSecret: env("PRIVY_APP_SECRET") });
try {
  const q = await privy.keyQuorums().get(env("PRIVY_AUTH_KEY_QUORUM_ID"));
  console.log("privy key quorum:", JSON.stringify({ id: q.id, threshold: (q as any).authorization_threshold, keys: (q as any).authorization_keys?.length, display_name: (q as any).display_name }));
} catch (e) {
  console.log("privy key quorum: ERROR", (e as Error).message.slice(0, 200));
}

const dyn = dynamicEvmClient(env("DYNAMIC_ENVIRONMENT_ID"));
await dyn.authenticateApiToken(env("DYNAMIC_API_TOKEN"));
const addr = process.argv[2] || "0xb1E9a0311088528F6cD90316a7f3c7E86d43060a"; // Phase 0 gate wallet
try {
  const w = await dyn.getWalletByAddress(addr);
  console.log("dynamic wallet:", JSON.stringify(w, (_k, v) => (typeof v === "string" && v.length > 120 ? v.slice(0, 20) + "…" : v)).slice(0, 900));
} catch (e) {
  console.log("dynamic wallet: ERROR", (e as Error).message.slice(0, 200));
}
process.exit(0);
