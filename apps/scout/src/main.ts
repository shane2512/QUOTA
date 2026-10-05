/// Scout CLI (PRD D1).
///   pnpm --filter @quota/scout start "research question" [--identity n] [--max-steps n] [--misbehave] [--scripted]
/// Model: QWEN_BASE_URL + QWEN_API_KEY + QWEN_MODEL (any OpenAI-compatible tool-calling endpoint).
///   --scripted replays a fixed plan with no model (TEST TOOLING; exercises the tools end to end); add --topup to include topup_stake.
/// Servers: SCOUT_SERVERS="name=url,name=url" (default search=http://localhost:8787/mcp,summary=http://localhost:8788/mcp);
///   each server's QUOTA id is read from its /health endpoint.
/// Wallet: the Privy agent wallet (PRIVY_AGENT_WALLET_ID, PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTH_PRIVATE_KEY).
/// topup_stake also needs DEMO_OPERATOR_PASSKEY (software operator passkey, test tooling).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, http, type Address } from "viem";
import { deriveSecret } from "@quota/client";
import { MemberState, identityCommitment, registryAbi } from "@quota/core";
import { SoftPasskey, defaultOrigin } from "@quota/devtools";
import { Broadcaster } from "@quota/slasher";
import { PrivyAgentWallet } from "@quota/wallets/privy";
import { LiveQuotaAccount } from "./account.ts";
import { OpenAICompatPlanner, ScriptedPlanner, type Planner } from "./llm.ts";
import { runScout } from "./scout.ts";
import { ScoutTools, type ServerConn } from "./tools.ts";
import { demoScript } from "./script.ts";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {}
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string, d: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);
const positional = argv.filter((a, i) => !a.startsWith("--") && !["--identity", "--max-steps"].includes(argv[i - 1]));
const goal = positional[0] || "What is a Merkle tree, and how do rate-limiting nullifiers (RLN) use one? Cite Wikipedia pages.";
const identity = Number(opt("--identity", process.env.SCOUT_IDENTITY || "0"));
const DATA = fileURLToPath(new URL("../data/", import.meta.url));

// ---- servers
async function connect(name: string, url: string): Promise<ServerConn> {
  const health = (await (await fetch(new URL("/health", url))).json()) as { serverId: string };
  const mcp = new Client({ name: "scout", version: "0.1.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(url)));
  const { tools } = await mcp.listTools();
  return {
    name,
    serverId: health.serverId,
    tools: tools.map((t) => ({ name: t.name, description: t.description ?? "" })),
    async call(tool, args, meta) {
      const r = await mcp.callTool({ name: tool, arguments: args, _meta: meta });
      return { isError: !!r.isError, text: (r.content as { text?: string }[]).map((c) => c.text ?? "").join("\n") };
    },
  };
}
const spec = process.env.SCOUT_SERVERS || "search=http://localhost:8787/mcp,summary=http://localhost:8788/mcp";
const servers = await Promise.all(spec.split(",").map((p) => connect(p.split("=")[0], p.split("=").slice(1).join("="))));

// ---- identity (Privy agent wallet)
const chain = createPublicClient({ transport: http(need("MONAD_RPC_URL")) });
const registry = need("QUOTA_REGISTRY_ADDRESS") as Address;
const privy = new PrivyClient({ appId: need("PRIVY_APP_ID"), appSecret: need("PRIVY_APP_SECRET") });
const wallet = await PrivyAgentWallet.load(privy, need("PRIVY_AGENT_WALLET_ID"), need("PRIVY_AUTH_PRIVATE_KEY"));
const secret = await deriveSecret((m) => wallet.signMessage(m), identity); // never printed
const id = identityCommitment(secret);
const member = (await chain.readContract({ address: registry, abi: registryAbi, functionName: "members", args: [id] })) as { state: number; limit: bigint };
if (member.state !== MemberState.Active) {
  throw new Error(`identity ${identity} of ${wallet.address} is not active (state ${member.state}); run wallets enroll-privy-agent --identity ${identity}`);
}
const rpId = need("WEBAUTHN_RP_ID");
const account = new LiveQuotaAccount({
  chain,
  registry,
  secret,
  idCommitment: id,
  limit: member.limit,
  epochLength: Number(process.env.QUOTA_EPOCH_SECONDS || 3600),
  usagePath: `${DATA}usage-${id.toString().slice(0, 12)}.json`,
  tx: new Broadcaster(chain, wallet, { maxFeePerGas: process.env.QUOTA_MAX_FEE_GWEI ? BigInt(process.env.QUOTA_MAX_FEE_GWEI) * 10n ** 9n : 120_000_000_000n }),
  passkey: new SoftPasskey(rpId, defaultOrigin(rpId), process.env.DEMO_OPERATOR_PASSKEY || undefined),
  allowOveruse: flag("--misbehave"),
});
const tools = new ScoutTools(servers, account, { maxLimit: BigInt(process.env.SCOUT_MAX_LIMIT || 10) });

// ---- planner
let planner: Planner;
if (flag("--scripted")) planner = new ScriptedPlanner(demoScript(servers.map((s) => s.name), argv.includes("--topup") ? Number(member.limit) + 1 : undefined));
else {
  if (!process.env.QWEN_API_KEY || !process.env.QWEN_BASE_URL || !process.env.QWEN_MODEL) {
    throw new Error("no model configured: set QWEN_BASE_URL, QWEN_API_KEY, QWEN_MODEL (or use --scripted, which runs a fixed plan without a model)");
  }
  planner = new OpenAICompatPlanner({ baseUrl: process.env.QWEN_BASE_URL, apiKey: process.env.QWEN_API_KEY, model: process.env.QWEN_MODEL });
}

console.log(`Scout · planner ${planner.label} · agent ${wallet.address} (Privy) identity ${identity} · limit ${member.limit}/epoch`);
console.log(`servers: ${servers.map((s) => `${s.name}=${s.serverId}`).join(", ")}${flag("--misbehave") ? " · MISBEHAVE: client will reuse message ids" : ""}`);
console.log(`goal: ${goal}\n`);
const r = await runScout({
  planner,
  tools,
  goal,
  maxSteps: Number(opt("--max-steps", "12")),
  onEvent: (e) => console.log(e.kind === "tool" ? `  ⚙ ${e.text}` : e.kind === "thought" ? `  … ${e.text}` : `\nANSWER:\n${e.text}`),
});
const file = `${DATA}transcript-${Date.now()}.json`;
writeFileSync(file, JSON.stringify({ goal, planner: planner.label, identity, steps: r.steps, toolLog: tools.log, answer: r.answer }, null, 2));
console.log(`\nsteps ${r.steps} · calls ${tools.log.filter((l) => l.tool === "call_tool").length} · transcript ${file}`);
process.exit(0);
