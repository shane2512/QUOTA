# DRAFT — "An agent that budgets anonymity: Qwen + QUOTA on Monad"

> Status: **draft, not publishable yet.** Sections marked `[PENDING QWEN RUN]` need real output from Qwen 3.8 Max (key not yet configured). Do not fill them with invented results; paste transcripts from `apps/scout/data/transcript-*.json`.

## 1. The problem (done)
AI agents now make a large share of calls to APIs and MCP tool servers. A service can stop abuse in several ways, and each costs the agent something:
- **Accounts or API keys:** every call is linked to one identity.
- **IP blocks:** they punish honest agents on shared cloud IPs.
- **Pay-per-call:** it publishes the agent's history.

QUOTA gives each staked agent *N* anonymous calls per epoch per service. Going over the limit reveals the agent's secret and gets its stake slashed. The question for an LLM agent becomes: **how do you plan real work inside a hard, private budget?**

## 2. What Scout is (done)
Scout is a tool-calling research agent with four tools:

| Tool | What it does |
|---|---|
| `quota_status` | remaining calls per server, limit, epoch reset, stake |
| `call_tool(server, tool, args)` | each call attaches a fresh RLN proof (one quota slot) |
| `switch_server` | quotas are separate per server |
| `topup_stake(messages_per_epoch)` | adds stake through the agent's Privy wallet and raises the limit with operator passkey approval |

Scout never resends with a used slot: the client refuses instead of cheating, because cheating forfeits the stake.

It talks to two QUOTA-protected MCP servers (Wikipedia search and page summaries) on Monad testnet. The model sits behind an OpenAI-compatible interface (`apps/scout/src/llm.ts`), so Qwen is a configuration change, not a code path.

## 3. Why Qwen here `[PENDING QWEN RUN]`
- Tool-calling reliability over a multi-step plan.
- Does it read `quota_status` and spread calls across servers?
- Does it choose *not* to top up when the task fits the budget?

Fill in from real runs: the number of steps, the calls used versus the limit, and whether the model ever tried to exceed its quota.

## 4. Walkthrough `[PENDING QWEN RUN]`
- One full transcript: goal → `quota_status` → plan → calls across both servers → answer with sources.
- Show the on-chain side: registry address, the agent's leaf index, and that the server only ever saw unlinkable proofs.

## 5. The cheating agent (done; evidence exists)
A deliberately misbehaving agent (`--cheat`) reuses a message id. The server recovers its secret from the two proofs, and a Dynamic server wallet slashes it on Monad through commit–reveal:
- On registry v3 a slash is profitable for the slasher: reward 0.25 MON vs gas 0.205 MON.
- Transactions: `docs/deployments.md`.

## 6. What we learned (partly done)
- Monad specifics:
  - **Reserve balance:** value transfers below 10 MON revert unless they are the sender's only transaction in the window.
  - **Async execution:** reads and balances lag a few blocks.
  - **Gas is billed on the limit,** so the reveal needed a one-pass Merkle removal (−29% gas).
- `[PENDING QWEN RUN]` What the model got right or wrong about budgeting, with numbers.

## 7. Links
Repo `github.com/shane2512/QUOTA` · registry v3 `0xCBdfda8ebF4302793C06a402E9753C4F43799990` · `docs/concept.md`
