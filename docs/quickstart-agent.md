# Quickstart: call QUOTA-protected services from your agent

**Who this is for:** you build an AI agent that calls APIs or MCP tool servers protected by QUOTA. You stake once; after that each request carries a zero-knowledge proof. Services cannot tell your requests apart or link them to you.

> Status: hackathon build on **Monad testnet**. Packages are used from this repo (TypeScript, run with `tsx`).

## 1. The 5 lines that matter
```ts
const secret = await deriveSecret((m) => wallet.signMessage({ message: m }));        // RLN secret from your agent wallet
const q = new QuotaClient({ secret, limit, artifacts: loadArtifacts(), merkleProof: () => membership.proof(),
                            usage: new FileUsageStore("data/usage.json") });           // remembers used ids across restarts
const membership = new RegistryMembership(chain, REGISTRY, q.leaf);                   // Merkle proof from the registry
const res = await quotaFetch(q, "my-api.example")("https://api.example/hello");       // HTTP: proof in x-quota-proof
const r = await mcp.callTool({ name, arguments: args, _meta: await quotaToolMeta(q, serverId, name, args) }); // MCP
```
- `deriveSecret` signs the fixed message `QUOTA/rln-secret/v1`. The secret is recoverable from the wallet and never stored. This needs deterministic signatures; viem local accounts and Privy (`gates.md` G2) qualify.
- `limit` is your per-epoch allowance per service. It is fixed at enrollment and costs `limit × UNIT` stake (UNIT is 0.01 MON on the dev registry).
- **Always use a persistent `usage` store.** An agent that restarts and forgets its count would reuse a message id, which reveals its secret and gets it slashed.
- When you are out of quota, `prove` throws `QuotaExhausted` instead of cheating. Wait for the next epoch, use another service, or stake more.

## 2. Try the demo end to end (repo checkout)
```bash
git clone https://github.com/shane2512/QUOTA.git && cd QUOTA && pnpm install
cp .env.example .env
```

Fill in `.env`:
- `MONAD_RPC_URL=https://testnet-rpc.monad.xyz`
- `QUOTA_REGISTRY_ADDRESS=0xd89BFd2f093015193d42EA51170D64d9242a40C6`
- `WEBAUTHN_RP_ID=localhost`
- `AGENT_PRIVATE_KEY=<new throwaway key>` (for example from `cast wallet new`)
- `DEPLOYER_PRIVATE_KEY=<a testnet key holding ≥ 0.55 MON>`. It funds the scripted operator; about 0.27 is returned.

1. **Stake:** `pnpm --filter @quota/devtools enroll-agent`
   - This uses a **software passkey** (test tooling). Real operators approve with their device passkey (`contracts/tools/passkey-demo`).
   - The scripted operator's key is discarded afterwards, so this demo stake cannot be unstaked.
2. **Run the protected MCP server:** `pnpm --filter @quota/demo-mcp start`
3. **Run the agent:** `pnpm --filter @quota/demo-mcp agent "Monad" "Merkle tree"`
   - Each call shows `OK` with the proof time.
   - Past your limit, the agent prints `STOP`.
   - With `--cheat` it keeps going: the server answers `violation`, recovers the secret, and slashes the stake if it runs with `QUOTA_SLASH=1` and a funded `SLASHER_PRIVATE_KEY`.
