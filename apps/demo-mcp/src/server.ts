/// Reference MCP server protected by QUOTA (PRD D2). One tool, `web_search`, backed by live Wikipedia search.
/// Every call must carry an RLN proof in params._meta["quota/proof"]; the REST twin GET /api/search uses the
/// x-quota-proof header. Over-quota calls (message-id reuse) leak the caller's secret; with QUOTA_SLASH=1 the
/// server slashes them on-chain through commit–reveal.
///
/// Env (../../.env, then process env): MONAD_RPC_URL, QUOTA_REGISTRY_ADDRESS
/// Optional: PORT (8787), QUOTA_SERVER_ID (demo-mcp.quota), QUOTA_EPOCH_SECONDS (3600), QUOTA_DB (data/nullifiers.db),
///           QUOTA_SLASH=1 + SLASHER_PRIVATE_KEY [+ SLASH_RECEIVER] to slash violators.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { z } from "zod";
import { loadVerificationKey } from "@quota/core";
import { QuotaVerifier, RegistryRootChecker, quotaExpress, quotaTool, type Violation } from "@quota/server";
import { SqliteNullifierStore } from "@quota/server/sqlite";
import { Broadcaster, CommitRevealPath, LocalKeyWallet, Slasher } from "@quota/slasher";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {}
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

const PORT = Number(process.env.PORT || 8787);
const SERVER_ID = process.env.QUOTA_SERVER_ID || "demo-mcp.quota";
const DB = process.env.QUOTA_DB || fileURLToPath(new URL("../data/nullifiers.db", import.meta.url));
const registry = need("QUOTA_REGISTRY_ADDRESS") as Address;
const chain = createPublicClient({ transport: http(need("MONAD_RPC_URL")) });

// ---- optional slasher
let slasher: Slasher | undefined;
if (process.env.QUOTA_SLASH === "1") {
  const tx = new Broadcaster(chain, new LocalKeyWallet(need("SLASHER_PRIVATE_KEY") as Hex));
  slasher = new Slasher({
    client: chain,
    registry,
    path: new CommitRevealPath(tx, registry),
    broadcaster: tx,
    receiver: (process.env.SLASH_RECEIVER as Address) || tx.wallet.address,
    onOutcome: (o) =>
      console.log(
        o.status === "slashed"
          ? `[slash] ${o.idCommitment}: commit ${o.result.commit.hash} reveal ${o.result.reveal.hash}`
          : `[slash] ${o.idCommitment}: ${o.status} ${"reason" in o ? o.reason : o.error}`,
      ),
  });
}

// ---- verifier (shared by every request)
mkdirSync(dirname(DB), { recursive: true });
const verifier = new QuotaVerifier({
  serverId: SERVER_ID,
  vkey: loadVerificationKey(),
  roots: new RegistryRootChecker(chain, registry),
  store: new SqliteNullifierStore(DB),
  epochLength: Number(process.env.QUOTA_EPOCH_SECONDS || 3600),
  onViolation: (v: Violation) => {
    console.log(`[violation] message-id reuse; idCommitment ${v.idCommitment} (secret recovered, not logged)`);
    if (slasher) void slasher.enqueue(v);
    else console.log("[violation] QUOTA_SLASH not set: not slashing");
  },
});

// ---- the protected work
async function wikipedia(query: string, limit: number) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({ action: "opensearch", search: query, limit: String(limit), format: "json" }).toString();
  const r = await fetch(url, { headers: { "user-agent": "QUOTA-demo-mcp/0.1 (Monad Metropolis hackathon)" } });
  if (!r.ok) throw new Error(`wikipedia ${r.status}`);
  const [, titles, , links] = (await r.json()) as [string, string[], string[], string[]];
  return titles.map((title, i) => ({ title, url: links[i] }));
}

function mcpServer() {
  const s = new McpServer({ name: "quota-demo-mcp", version: "0.1.0" });
  s.registerTool(
    "web_search",
    {
      description: "Search Wikipedia. Rate-limited by QUOTA: attach an RLN proof in _meta['quota/proof'].",
      inputSchema: { query: z.string().min(1).max(200), limit: z.number().int().min(1).max(10).optional() },
    },
    quotaTool(verifier, "web_search", async ({ query, limit }: { query: string; limit?: number }) => {
      const hits = await wikipedia(query, limit ?? 5);
      return { content: [{ type: "text" as const, text: JSON.stringify(hits) }] };
    }),
  );
  return s;
}

// ---- HTTP
const app = express();
app.use(express.json());
app.get("/health", (_req, res) => void res.json({ ok: true, serverId: SERVER_ID, registry, slashing: !!slasher }));
app.get("/api/search", quotaExpress(verifier), async (req, res) => {
  res.json(await wikipedia(String(req.query.q ?? ""), 5));
});
app.post("/mcp", async (req, res) => {
  // stateless Streamable HTTP: one MCP server + transport per request; the verifier and its store are shared
  const server = mcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => console.log(`quota demo-mcp on http://localhost:${PORT}/mcp (server id ${SERVER_ID}, registry ${registry})`));
