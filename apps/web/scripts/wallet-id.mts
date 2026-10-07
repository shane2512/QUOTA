/// Look up the operator wallet the console created for a Privy login, so the CLI agent can run as the identity
/// that was just enrolled in the browser.
///   pnpm wallet-id you@example.com            (or a Privy user id: did:privy:…)
/// Prints the wallet id, address and balance, and the .env line for the demo agent / Scout. Read-only; no secrets printed.
import { fileURLToPath } from "node:url";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, formatEther, http, type Address } from "viem";
import { monadTestnet } from "../lib/registry.ts";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const who = process.argv[2];
if (!who) {
  console.error("usage: pnpm wallet-id <email | did:privy:…>");
  process.exit(2);
}
const privy = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const userId = who.startsWith("did:privy:") ? who : (await privy.users().getByEmailAddress({ address: who }).catch(() => undefined))?.id;
if (!userId) {
  console.error(`no Privy user found for ${who}; log in to the operator console with that email first`);
  process.exit(1);
}
// must match externalId() in lib/operator-server.ts
const externalId = `quota-${userId.replace(/^did:privy:/, "")}`.slice(0, 60);
const w = (await privy.wallets().list({ external_id: externalId, chain_type: "ethereum" } as never)).data?.[0];
if (!w) {
  console.error(`user ${userId} has no console wallet yet; open /operator and log in once`);
  process.exit(1);
}
const chain = createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL || undefined) });
console.log(`user     ${userId}`);
console.log(`wallet   ${w.address}  ${formatEther(await chain.getBalance({ address: w.address as Address }))} MON`);
console.log(`\nPRIVY_AGENT_WALLET_ID=${w.id}`);
console.log("(put that line in .env to run the demo agent or Scout as this operator's identities, e.g. --identity 0)");
process.exit(0);
