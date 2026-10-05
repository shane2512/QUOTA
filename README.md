# QUOTA

**Anonymous, stake-backed rate limits for AI-agent traffic on Monad.** Monad Metropolis · Track 4: Trust, Identity & AI Infrastructure.

How it works:
- An agent stakes once. A human operator approves the stake with a passkey, and the contract checks the passkey on-chain through Monad's P256 precompile.
- Every request then carries a zero-knowledge proof (RLN-v2): "I am a staked member, and this is request *k* of my *N* this epoch".
- The service learns neither who the agent is nor whether two requests came from the same agent.
- Reusing a request number reveals the agent's secret, and anyone holding the secret can slash the stake. The slash uses commit–reveal, so a block leader cannot copy the claim and take the reward.
- There is no issuer and no accounts. The deliverable is a **primitive**: contracts, SDKs and middleware, plus a reference MCP server and the Scout agent.

Plain-language overview: [`docs/concept.md`](docs/concept.md) · requirements: [`docs/01-PRD.md`](docs/01-PRD.md) · status and evidence: [`docs/progress.md`](docs/progress.md), [`docs/deployments.md`](docs/deployments.md), [`docs/gates.md`](docs/gates.md).

## Live on Monad testnet (chain 10143)

| What | Where |
|---|---|
| `QuotaRegistry` v3 (current) | [`0xCBdfda8ebF4302793C06a402E9753C4F43799990`](https://testnet.monadvision.com/address/0xCBdfda8ebF4302793C06a402E9753C4F43799990), source verified on Sourcify. Passkey domain `quota-metro.vercel.app`; 0.1 MON stake per message per epoch; 50% of a slashed stake to the slasher, the rest burned |
| Agent wallet (Privy) | `0x1Ec0d0992990008Bcf1555FFd809Ca78aE651aA6`. Owned by the operator's Privy user; our runtime key may only call the registry, on this chain, up to 1 MON, and sign the agent-secret message |
| Slasher wallet (Dynamic) | `0xe5505A02A68Ff02D55b90e8D8D179b5e2EBd2b15`. Server wallet; its key share is backed up to Dynamic, and no share is held locally |
| End-to-end evidence | Enroll → proofs → cheat → slash, with transaction hashes: [`docs/deployments.md`](docs/deployments.md) |

## What is in the repo

```
contracts/          QuotaRegistry (Poseidon Merkle tree, passkey custody, commit–reveal slash), PasskeyAuth (WebAuthn via P256VERIFY)
packages/core       hashing, tree, proof wire format, pinned RLN-v2 ceremony artifacts, registry reads
packages/client     @quota/client: proofs per request, message-id tracking, fetch + MCP helpers, secret derivation
packages/server     @quota/server: verifier, nullifier stores (memory, SQLite), Express / Hono / MCP middleware
packages/slasher    commit–reveal submit path, slasher queue, wallet-adapter interface
packages/wallets    Privy agent wallet + policy, Dynamic service wallet
packages/devtools   TEST TOOLING (software passkey, scripted enrollment, Phase 3 e2e)
apps/demo-mcp       reference MCP server (live Wikipedia tools) behind QUOTA, plus a demo agent with --cheat
apps/scout          Scout: LLM research agent that budgets its anonymous quota across servers
apps/web            landing / consoles (separate contributor; shows demo data)
```

## Run it

You need Node ≥ 22.13, pnpm ≥ 9, git and Foundry (for the contract tests).

```bash
git clone --recurse-submodules https://github.com/shane2512/QUOTA.git && cd QUOTA
pnpm install
pnpm typecheck && pnpm test                  # SDK, server, wallet and Scout tests (real Groth16 proofs)
(cd contracts && forge test)                 # contract tests incl. passkey negatives and the copy-and-steal (searcher) test
```

### Protect your own API in < 10 minutes
Follow [`docs/quickstart-service.md`](docs/quickstart-service.md). You need no keys to *verify* requests.

### The full demo (needs funded testnet keys in `.env`; see `.env.example`)
```bash
# 1. two QUOTA-protected MCP servers (Wikipedia search / page summaries); the first one slashes cheaters with Dynamic
QUOTA_SLASH=1 PORT=8787 QUOTA_SERVER_ID=demo-search.quota  QUOTA_TOOLSET=search  pnpm --filter @quota/demo-mcp start
PORT=8788 QUOTA_SERVER_ID=demo-summary.quota QUOTA_TOOLSET=summary pnpm --filter @quota/demo-mcp start

# 2. stake a fresh agent identity from the Privy wallet (identity n = a new, unlinkable member)
pnpm --filter @quota/wallets exec tsx scripts/enroll-privy-agent.ts --identity 2 --limit 3

# 3. Scout plans research inside its quota (needs QWEN_BASE_URL / QWEN_API_KEY / QWEN_MODEL)
pnpm --filter @quota/scout start "How do rate-limiting nullifiers use Merkle trees?" --identity 2

# 4. a cheating agent: reuses a message id → the server recovers its secret → commit–reveal slash on-chain
pnpm --filter @quota/demo-mcp agent --identity 2 --cheat "one call too many"
```
`pnpm --filter @quota/scout start --scripted --identity n` runs a fixed plan with no model. It is test tooling that exercises every Scout tool without an LLM key.

## Honest limits
- **Not proof of personhood.** The stake makes abuse expensive; a passkey is not a unique human.
- **Quotas are per server**, not global. Anonymity is among all members staked in the registry.
- **No BTX.** Monad's encrypted mempool isn't available to us; the slash uses commit–reveal instead (`gates.md` G1).
- **Proofs take about 0.5–2 s** on a laptop, so this targets tool servers and APIs, not public RPC.
- **Monad's reserve balance** (10 MON) shapes how operators fund value transfers ([docs](https://docs.monad.xyz/developer-essentials/reserve-balance)).
- **Cut or deferred:**
  - Cleanverse (gated docs) and Nansen (free tier, and it only indexes Monad mainnet; `gates.md` G5) are cut.
  - Dynamic delegated access is untested.
  - The Qwen model key is pending.
  - The operator passkey in scripts is a software stand-in (labelled test tooling). A real hardware passkey was verified on-chain in Phase 1.
