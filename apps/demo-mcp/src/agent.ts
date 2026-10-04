/// Demo agent: calls the QUOTA-protected MCP server with an RLN proof per tool call.
/// Usage: pnpm --filter @quota/demo-mcp agent "query one" "query two" ...
///        add --cheat to keep calling past the limit (reuses message ids → the server recovers the secret).
/// Env (../../.env): MONAD_RPC_URL, QUOTA_REGISTRY_ADDRESS, AGENT_PRIVATE_KEY. Optional: QUOTA_SERVER_URL
/// (http://localhost:8787/mcp), QUOTA_SERVER_ID (demo-mcp.quota), QUOTA_EPOCH_SECONDS (3600).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FileUsageStore, QuotaClient, QuotaExhausted, RegistryMembership, deriveSecret, quotaToolMeta } from "@quota/client";
import { identityCommitment, loadArtifacts, registryAbi, MemberState } from "@quota/core";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {}
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

const args = process.argv.slice(2);
const cheat = args.includes("--cheat");
const queries = args.filter((a) => a !== "--cheat");
if (queries.length === 0) queries.push("Monad blockchain", "rate limiting", "zero-knowledge proof");

const chain = createPublicClient({ transport: http(need("MONAD_RPC_URL")) });
const registry = need("QUOTA_REGISTRY_ADDRESS") as Address;
const serverId = process.env.QUOTA_SERVER_ID || "demo-mcp.quota";
const wallet = privateKeyToAccount(need("AGENT_PRIVATE_KEY") as Hex);
const secret = await deriveSecret((m) => wallet.signMessage({ message: m })); // never printed
const id = identityCommitment(secret);
const member = (await chain.readContract({ address: registry, abi: registryAbi, functionName: "members", args: [id] })) as {
  state: number;
  limit: bigint;
};
if (member.state !== MemberState.Active) throw new Error(`agent not active in the registry (state ${member.state}); run devtools enroll-agent`);

const quota = new QuotaClient({
  secret,
  limit: member.limit,
  artifacts: loadArtifacts(),
  merkleProof: () => membership.proof(),
  epochLength: Number(process.env.QUOTA_EPOCH_SECONDS || 3600),
  allowOveruse: cheat,
  usage: new FileUsageStore(new URL("../data/agent-usage.json", import.meta.url).pathname),
});
const membership = new RegistryMembership(chain, registry, quota.leaf);

const mcp = new Client({ name: "quota-demo-agent", version: "0.1.0" });
await mcp.connect(new StreamableHTTPClientTransport(new URL(process.env.QUOTA_SERVER_URL || "http://localhost:8787/mcp")));
console.log(`agent idCommitment ${id}, limit ${member.limit}/epoch, remaining now ${quota.remaining(serverId)}`);

for (const query of queries) {
  const toolArgs = { query, limit: 3 };
  try {
    const t0 = Date.now();
    const _meta = await quotaToolMeta(quota, serverId, "web_search", toolArgs);
    const proveMs = Date.now() - t0;
    const r = await mcp.callTool({ name: "web_search", arguments: toolArgs, _meta });
    const text = (r.content as { text: string }[])[0]?.text ?? "";
    console.log(`${r.isError ? "REJECTED" : "OK      "} "${query}" (proof ${proveMs} ms) → ${text.slice(0, 160)}`);
  } catch (e) {
    if (e instanceof QuotaExhausted) {
      console.log(`STOP     "${query}": quota exhausted for this epoch (client refuses to reuse a message id)`);
      break;
    }
    throw e;
  }
}
await mcp.close();
await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
