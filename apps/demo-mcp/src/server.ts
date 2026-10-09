/// Reference MCP server protected by QUOTA (PRD D2). One tool, `web_search`, backed by live Wikipedia search.
/// Every call must carry an RLN proof in params._meta["quota/proof"]; the REST twin GET /api/search uses the
/// x-quota-proof header. Over-quota calls (message-id reuse) leak the caller's secret; with QUOTA_SLASH=1 the
/// server slashes them on-chain through commit–reveal.
///
/// Env (../../.env, then process env): MONAD_RPC_URL, QUOTA_REGISTRY_ADDRESS
/// Optional: PORT (8787), QUOTA_SERVER_ID (demo-mcp.quota), QUOTA_EPOCH_SECONDS (3600), QUOTA_DB (data/nullifiers.db),
///           QUOTA_TOOLSET (search | summary | both; default search): which Wikipedia tools this instance serves.
///           QUOTA_SLASH=1 to slash violators, signing with the Dynamic server wallet (DYNAMIC_ENVIRONMENT_ID,
///           DYNAMIC_API_TOKEN, DYNAMIC_SLASHER_WALLET, DYNAMIC_WALLET_PASSWORD) or, if those are unset,
///           SLASHER_PRIVATE_KEY. Rewards go to SLASH_RECEIVER or the slasher wallet itself.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPublicClient, formatEther, http, parseEther, type Address, type Hex } from "viem";
import { z } from "zod";
import { loadVerificationKey } from "@quota/core";
import { QuotaVerifier, RegistryRootChecker, quotaExpress, quotaTool, type Violation } from "@quota/server";
import { SqliteNullifierStore } from "@quota/server/sqlite";
import { Broadcaster, CommitRevealPath, LocalKeyWallet, Slasher, type WalletAdapter } from "@quota/slasher";
import { DynamicServiceWallet } from "@quota/wallets/dynamic";
import { DelegatedDynamicWallet, DelegationStore, WebhookError, dynamicDelegatedApi, parseWebhook, type Delegation } from "@quota/wallets/dynamic-delegated";
import { Feed } from "./feed.ts";

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
const feed = new Feed(); // live data for the service console, served at GET /feed


const onOutcome: NonNullable<ConstructorParameters<typeof Slasher>[0]["onOutcome"]> = (o) => {
  feed.slash({
    idCommitment: BigInt(o.idCommitment),
    status: o.status,
    commit: o.status === "slashed" ? o.result.commit.hash : undefined,
    reveal: o.status === "slashed" ? o.result.reveal.hash : undefined,
  });
  console.log(
    o.status === "slashed"
      ? `[slash] ${o.idCommitment}: commit ${o.result.commit.hash} reveal ${o.result.reveal.hash}`
      : `[slash] ${o.idCommitment}: ${o.status} ${"reason" in o ? o.reason : o.error}`,
  );
};

// ---- optional slasher
let slasher: Slasher | undefined;
type SlasherInfo = { provider: "dynamic" | "dynamic-delegated" | "local"; address: string };
let slasherInfo: SlasherInfo | undefined; // published on /feed and /health (public address only)
if (process.env.QUOTA_SLASH === "1") {
  let wallet: WalletAdapter;
  if (process.env.DYNAMIC_SLASHER_WALLET) {
    const d = await DynamicServiceWallet.connect({
      environmentId: need("DYNAMIC_ENVIRONMENT_ID"),
      apiToken: need("DYNAMIC_API_TOKEN"),
      metadataB64: need("DYNAMIC_SLASHER_WALLET"),
      password: need("DYNAMIC_WALLET_PASSWORD"),
    });
    d.onRetry = (n, err) => console.log(`[slash] dynamic sign attempt ${n} failed (${err.slice(0, 80)}); retrying`);
    wallet = d;
  } else wallet = new LocalKeyWallet(need("SLASHER_PRIVATE_KEY") as Hex);
  slasherInfo = { provider: process.env.DYNAMIC_SLASHER_WALLET ? "dynamic" : "local", address: wallet.address };
  console.log(`[slash] slasher wallet ${wallet.address} (${process.env.DYNAMIC_SLASHER_WALLET ? "Dynamic server wallet" : "local key"})`);
  const tx = new Broadcaster(chain, wallet, { maxFeePerGas: process.env.QUOTA_MAX_FEE_GWEI ? BigInt(process.env.QUOTA_MAX_FEE_GWEI) * 1_000_000_000n : undefined });
  slasher = new Slasher({
    client: chain,
    registry,
    path: new CommitRevealPath(tx, registry),
    broadcaster: tx,
    receiver: (process.env.SLASH_RECEIVER as Address) || tx.wallet.address,
    onOutcome,
  });
}


// ---- optional: slashing from an operator's own Dynamic embedded wallet (delegated access)
// The operator signs in with Dynamic in the browser and approves delegation; Dynamic posts an encrypted webhook to
// POST /dynamic/webhook. Slashes then go out from THEIR wallet and the reward lands there. Revocation removes it.
const baseSlasherInfo = slasherInfo;
const pemRaw = process.env.DYNAMIC_DELEGATION_PRIVATE_KEY || "";
// accepts a PEM (real newlines, or the two characters \n), or the PEM base64-encoded on one line
const delegationPem = pemRaw.includes("BEGIN") ? pemRaw.replace(/\\n/g, "\n") : pemRaw ? Buffer.from(pemRaw, "base64").toString("utf8") : "";
const webhookSecret = process.env.DYNAMIC_WEBHOOK_SECRET || "";
const delegationOn = !!(delegationPem && webhookSecret && process.env.DYNAMIC_ENVIRONMENT_ID && process.env.DYNAMIC_API_TOKEN);
const delegations = new DelegationStore(
  process.env.QUOTA_DELEGATION_FILE || join(dirname(DB), "delegations.enc.json"),
  process.env.DYNAMIC_WALLET_PASSWORD, // re-encrypts the delegated signing material at rest
);
let delegated: { slasher: Slasher; address: Address; walletId: string } | undefined;
const MIN_DELEGATED_BALANCE = parseEther(process.env.QUOTA_DELEGATED_MIN_MON || "0.3"); // gas for commit + reveal at 120 gwei

async function activateDelegation(d: Delegation) {
  const api = await dynamicDelegatedApi({ environmentId: need("DYNAMIC_ENVIRONMENT_ID"), apiToken: need("DYNAMIC_API_TOKEN") });
  const wallet = await DelegatedDynamicWallet.connect(api, d); // proves control: signs a challenge and recovers the address
  wallet.onRetry = (n, err) => console.log(`[slash] delegated sign attempt ${n} failed (${err.slice(0, 80)}); retrying`);
  const tx = new Broadcaster(chain, wallet, { maxFeePerGas: process.env.QUOTA_MAX_FEE_GWEI ? BigInt(process.env.QUOTA_MAX_FEE_GWEI) * 1_000_000_000n : undefined });
  delegated = {
    walletId: d.walletId,
    address: wallet.address,
    slasher: new Slasher({ client: chain, registry, path: new CommitRevealPath(tx, registry), broadcaster: tx, receiver: wallet.address, onOutcome }),
  };
  slasherInfo = { provider: "dynamic-delegated", address: wallet.address };
  const bal = await chain.getBalance({ address: wallet.address });
  console.log(`[delegation] slashing from the operator's wallet ${wallet.address} (${formatEther(bal)} MON${bal < MIN_DELEGATED_BALANCE ? `, below the ${formatEther(MIN_DELEGATED_BALANCE)} MON needed: fund it` : ""})`);
}
if (delegationOn) {
  const n = delegations.load();
  const last = delegations.latest();
  if (n && last) void activateDelegation(last).catch((e) => console.log(`[delegation] could not restore ${last.walletId}: ${String(e).slice(0, 120)}`));
  console.log(`[delegation] webhook enabled at POST /dynamic/webhook (${n} stored)`);
}

/// Delegated wallet first (if it can pay gas), otherwise the server's own slasher.
async function pickSlasher(): Promise<Slasher | undefined> {
  if (delegated) {
    const bal = await chain.getBalance({ address: delegated.address }).catch(() => 0n);
    if (bal >= MIN_DELEGATED_BALANCE) return delegated.slasher;
    console.log(`[delegation] ${delegated.address} holds ${formatEther(bal)} MON, below ${formatEther(MIN_DELEGATED_BALANCE)}: using the server slasher`);
  }
  return slasher;
}

// ---- verifier (shared by every request)
mkdirSync(dirname(DB), { recursive: true });
const verifier = new QuotaVerifier({
  serverId: SERVER_ID,
  vkey: loadVerificationKey(),
  roots: new RegistryRootChecker(chain, registry),
  store: new SqliteNullifierStore(DB),
  epochLength: Number(process.env.QUOTA_EPOCH_SECONDS || 3600),
  onResult: feed.result,
  onViolation: (v: Violation) => {
    console.log(`[violation] message-id reuse; idCommitment ${v.idCommitment} (secret recovered, not logged)`);
    void pickSlasher().then((sl) => {
      if (sl) void sl.enqueue(v);
      else console.log("[violation] QUOTA_SLASH not set: not slashing");
    });
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

async function summary(title: string) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
    headers: { "user-agent": "QUOTA-demo-mcp/0.1 (Monad Metropolis hackathon)" },
  });
  if (r.status === 404) return { title, extract: "(no article with that exact title)" };
  if (!r.ok) throw new Error(`wikipedia ${r.status}`);
  const d = (await r.json()) as { title: string; extract: string; content_urls?: { desktop?: { page?: string } } };
  return { title: d.title, extract: d.extract.slice(0, 1200), url: d.content_urls?.desktop?.page };
}

const TOOLSET = process.env.QUOTA_TOOLSET || "search";

function mcpServer() {
  const s = new McpServer({ name: `quota-demo-mcp (${SERVER_ID})`, version: "0.1.0" });
  if (TOOLSET === "summary" || TOOLSET === "both") {
    s.registerTool(
      "page_summary",
      {
        description: "Get the lead summary of a Wikipedia article by exact title. Rate-limited by QUOTA: attach an RLN proof in _meta['quota/proof'].",
        inputSchema: { title: z.string().min(1).max(200) },
      },
      quotaTool(verifier, "page_summary", async ({ title }: { title: string }) => ({
        content: [{ type: "text" as const, text: JSON.stringify(await summary(title)) }],
      })),
    );
  }
  if (TOOLSET === "summary") return s;
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
app.use(express.json({ verify: (req, _res, buf) => void ((req as unknown as { rawBody: Buffer }).rawBody = buf) })); // the webhook HMAC is over the raw bytes
// Public, read-only: short nullifiers, statuses and tx hashes only (see feed.ts).
app.get("/feed", (_req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.json({ serverId: SERVER_ID, registry, slashing: !!slasher, slasher: slasherInfo, epochSeconds: Number(process.env.QUOTA_EPOCH_SECONDS || 3600), ...feed.snapshot() });
});
app.post("/dynamic/webhook", async (req, res) => {
  const signature = req.header("x-dynamic-signature-256");
  // Reachability ping: the dashboard calls the URL before it hands out the signing secret, so this must answer
  // 200 even while the secret is not configured yet. Nothing happens.
  if (!signature) return void res.json({ ok: true, ignored: "unsigned request" });
  if (!delegationOn) return void res.status(503).json({ error: "delegated access is not configured on this server" });
  try {
    const ev = await parseWebhook({ rawBody: (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0), signature, secret: webhookSecret, privateKeyPem: delegationPem });
    if (ev.kind === "created") {
      delegations.set(ev.delegation);
      res.json({ ok: true });
      void activateDelegation(ev.delegation).catch((e) => console.log(`[delegation] could not activate ${ev.delegation.walletId}: ${String(e).slice(0, 160)}`));
      return;
    }
    if (ev.kind === "revoked") {
      delegations.delete(ev.walletId);
      if (delegated?.walletId === ev.walletId) {
        delegated = undefined;
        slasherInfo = baseSlasherInfo;
        console.log(`[delegation] revoked ${ev.walletId}: back to the server slasher`);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof WebhookError) return void res.status(e.status).json({ error: e.message });
    console.log(`[delegation] webhook failed: ${String(e).slice(0, 160)}`);
    res.status(500).json({ error: "webhook failed" });
  }
});
app.get("/health", (_req, res) => void res.json({ ok: true, serverId: SERVER_ID, registry, slashing: !!slasher, slasher: slasherInfo }));
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

app.listen(PORT, () => console.log(`quota demo-mcp on http://localhost:${PORT}/mcp (server id ${SERVER_ID}, toolset ${TOOLSET}, registry ${registry})`));
