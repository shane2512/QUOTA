# Quickstart: protect your API or MCP server with QUOTA

**Who this is for:** you run an API or MCP tool server and want to stop any single AI agent from hammering it, without accounts, API keys or tracking. Target time: **under 10 minutes**.

**What you get:**
- Every request must carry a zero-knowledge proof that it comes from a staked agent and is within that agent's per-epoch limit.
- You never learn which agent sent a request.
- An agent that goes over its limit leaks its secret, and you can slash its stake.

> Status: hackathon build on **Monad testnet**. The packages are not on npm yet; you use them from this repo (TypeScript source, run with `tsx`).

## 0. Prerequisites
- Node.js ≥ 22.13 (for the built-in `node:sqlite` store), pnpm ≥ 9, git.
- Nothing to pay and no keys needed to *verify* requests: verification is off-chain plus a read-only RPC call.

## 1. Get the code (≈ 2 min)
```bash
git clone https://github.com/shane2512/QUOTA.git
cd QUOTA
pnpm install
```

## 2. Create your service (≈ 3 min)
```bash
mkdir -p apps/my-api && cd apps/my-api
```

`package.json`:
```json
{
  "name": "my-api",
  "private": true,
  "type": "module",
  "scripts": { "start": "tsx server.ts" },
  "dependencies": {
    "@quota/core": "workspace:*",
    "@quota/server": "workspace:*",
    "express": "^5.2.1",
    "viem": "^2.57.2"
  },
  "devDependencies": { "tsx": "^4.23.15" }
}
```

`server.ts`:
```ts
import express from "express";
import { createPublicClient, http } from "viem";
import { loadVerificationKey } from "@quota/core";
import { QuotaVerifier, RegistryRootChecker, quotaExpress } from "@quota/server";
import { SqliteNullifierStore } from "@quota/server/sqlite";

const registry = "0xd89BFd2f093015193d42EA51170D64d9242a40C6"; // QUOTA registry v2, Monad testnet
const chain = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });

const quota = new QuotaVerifier({
  serverId: "my-api.example",                 // your quota namespace: agents prove against this id
  vkey: loadVerificationKey(),                // pinned RLN-v2 verification key
  roots: new RegistryRootChecker(chain, registry),
  store: new SqliteNullifierStore("nullifiers.db"),
  epochLength: 3600,                          // each staked agent gets its limit per hour
  onViolation: (v) => console.log("over-quota agent caught:", v.idCommitment.toString()),
});

const app = express();
app.use(express.json());
app.get("/hello", quotaExpress(quota), (_req, res) => { res.json({ hello: "anonymous staked agent" }); });
app.listen(3001, () => console.log("listening on http://localhost:3001"));
```

```bash
cd ../.. && pnpm install && pnpm --filter my-api start
```

## 3. Check it (≈ 1 min)
In a second terminal:
```bash
curl -i http://localhost:3001/hello
```
Expected: `HTTP/1.1 401` with `{"error":"quota","reason":"missing"}`. Requests without a valid proof never reach your handler.

| Response | Meaning |
|---|---|
| 401 `missing` / `invalid-proof` / `unknown-root` / `bad-payload` / `bad-epoch` | no proof, a forged proof, a non-member, a proof made for a different request, or a stale proof |
| 409 `replay` | the exact same request and proof sent twice |
| 429 `violation` | the agent reused a message id: it is over its limit. `onViolation` now holds its secret |

## 4. Call it as a staked agent (optional, needs an enrolled agent)
An agent needs a stake in the registry (see `docs/quickstart-agent.md`). With an enrolled agent's key as `AGENT_PRIVATE_KEY` in the repo's `.env`, add `"@quota/client": "workspace:*"` to your `package.json` dependencies, run `pnpm install`, and create `call.ts`:
```ts
import { createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FileUsageStore, QuotaClient, RegistryMembership, deriveSecret, quotaFetch } from "@quota/client";
import { identityCommitment, loadArtifacts, registryAbi } from "@quota/core";

process.loadEnvFile("../../.env");
const registry = "0xd89BFd2f093015193d42EA51170D64d9242a40C6" as Address;
const chain = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const wallet = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
const secret = await deriveSecret((m) => wallet.signMessage({ message: m }));
const me = await chain.readContract({ address: registry, abi: registryAbi, functionName: "members", args: [identityCommitment(secret)] });
const q = new QuotaClient({ secret, limit: me.limit, artifacts: loadArtifacts(), merkleProof: () => membership.proof(),
                            usage: new FileUsageStore("agent-usage.json") });
const membership = new RegistryMembership(chain, registry, q.leaf);
const res = await quotaFetch(q, "my-api.example")("http://localhost:3001/hello");
console.log(res.status, await res.text());
process.exit(0);
```
```bash
pnpm --filter my-api exec tsx call.ts
```
Expected: `200 {"hello":"anonymous staked agent"}`, and your server log stays quiet. Running it more times than the agent's limit within the hour makes the client stop with `QuotaExhausted`.

## 5. Variants
- **Hono:** `app.use("/api/*", quotaHono(quota))`.
- **MCP tools:** wrap the handler: `server.registerTool("name", config, quotaTool(quota, "name", handler))`. Agents put the proof in `params._meta["quota/proof"]`. A complete server is in `apps/demo-mcp/src/server.ts`.
- **Slash violators:** pass `onViolation: (v) => slasher.enqueue(v)` with a `Slasher` from `@quota/slasher`. Commit–reveal; the slasher wallet pays gas (~0.28 MON per slash on testnet today).

## What QUOTA does not do
- It is **not proof of personhood**. The stake is what makes abuse expensive.
- Quotas are **per `serverId`**, not global.
- Proofs take ~0.6–1.5 s to make on a laptop, so this is not for latency-critical public RPC.
