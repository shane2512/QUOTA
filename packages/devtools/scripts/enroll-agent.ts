/// Enroll the demo agent (AGENT_PRIVATE_KEY) in the registry, using a scripted operator. TEST TOOLING.
/// Env (../../.env): MONAD_RPC_URL, QUOTA_REGISTRY_ADDRESS, DEPLOYER_PRIVATE_KEY (funder), AGENT_PRIVATE_KEY,
///                   WEBAUTHN_RP_ID, AGENT_LIMIT (default 5).
/// Run: pnpm --filter @quota/devtools enroll-agent
import { createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deriveSecret } from "@quota/client";
import { identityCommitment, registryAbi } from "@quota/core";
import { Broadcaster, LocalKeyWallet } from "@quota/slasher";
import { enrollWithSoftPasskey } from "../src/index.ts";

import { fileURLToPath } from "node:url";
process.loadEnvFile?.(fileURLToPath(new URL("../../../.env", import.meta.url)));
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

const client = createPublicClient({ transport: http(need("MONAD_RPC_URL")) });
const registry = need("QUOTA_REGISTRY_ADDRESS") as Address;
const agent = privateKeyToAccount(need("AGENT_PRIVATE_KEY") as Hex);
const secret = await deriveSecret((m) => agent.signMessage({ message: m })); // never printed
const id = identityCommitment(secret);
const m = (await client.readContract({ address: registry, abi: registryAbi, functionName: "members", args: [id] })) as { state: number; index: number };
if (m.state !== 0) {
  console.log(`agent already known to the registry: idCommitment ${id}, state ${m.state}, index ${m.index}`);
} else {
  const r = await enrollWithSoftPasskey({
    client,
    registry,
    funder: new Broadcaster(client, new LocalKeyWallet(need("DEPLOYER_PRIVATE_KEY") as Hex)),
    idCommitment: id,
    limit: BigInt(process.env.AGENT_LIMIT || 5),
    rpId: need("WEBAUTHN_RP_ID"),
    log: console.log,
  });
  console.log(`idCommitment ${id}\nindex ${r.index}`);
  for (const t of r.txs) console.log(`${t.label.padEnd(16)} estimate ${t.sent.gasEstimate} limit ${t.sent.gasLimit} tx ${t.sent.hash}`);
}
