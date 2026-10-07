# QUOTA — Demo and pitch video scripts

Hackathon limits: **technical demo ≤ 3 min, live product, no slides** · **pitch ≤ 2 min** · optional 30 s ad. Both must be honest: testnet, unaudited, commit–reveal (not BTX), software passkey only where stated.

## A. Technical demo (≤ 3:00) — live product

**Story:** a human enrolls an agent with a real passkey → the agent makes anonymous requests → a cheater is caught → the slash lands on-chain. The same identity runs through all four beats (the console and the CLI agent derive identical identities; checked 2026-10-07).

### Pre-flight (do this before recording; none of it is shown)
1. Chrome logged **out** of the operator console, a passkey device ready, DevTools closed.
2. A console wallet funded (about 0.8 MON; `pnpm fund <address> 0.8`). Look up its id: `pnpm wallet-id <your email>` → put `PRIVY_AGENT_WALLET_ID=…` in `.env`.
3. Terminal 1: `PORT=8787 QUOTA_SERVER_ID=demo-search.quota QUOTA_SLASH=1 QUOTA_MAX_FEE_GWEI=120 pnpm --filter @quota/demo-mcp start` (needs a funded slasher: the Dynamic wallet variables, or `SLASHER_PRIVATE_KEY` with ≥ 0.5 MON). **Stop any stale server first and delete `apps/demo-mcp/data` (stop → delete → start), or old message ids will trigger false violations.**
4. Local web for the feed: `apps/web/.env.local` with `FEED_URL=http://localhost:8787/feed`, then `pnpm --filter @quota/web dev` (port 3000) and open `http://localhost:3000/service` in a second Chrome window. (The deployed `/service` cannot reach your laptop.)
5. Pick a **fresh identity** (never used, never slashed) and check it is free. The cheat will burn it.
6. Do one full dry run the day before; transactions take a few seconds on Monad and the unstake delay is 2 hours (do not plan to show a withdrawal).

### Shot list

| Time | On screen | Say (plain, no jargon) |
|---|---|---|
| 0:00–0:15 | `quota-metro.vercel.app/service` showing live block number and the registry numbers | "QUOTA lets AI agents prove they are within a paid-for request limit without revealing who they are. This is live on Monad testnet; these numbers come from the chain." |
| 0:15–1:00 | `/operator`: log in, wallet appears; click **Create passkey and register**, tap; **Enroll agent** with limit 3, tap; the row turns `active` | "A human owns the deposit. A passkey tap, verified by the chain itself, approves every stake action, so a leaked agent key cannot move the money." (Show the tx link opening to **success**, 3 s.) |
| 1:00–1:45 | Terminal: `pnpm --filter @quota/demo-mcp agent --identity N "monad" "merkle tree" "rate limit"` with the `/service` feed window beside it filling with `verified` rows | "The agent now makes three requests. Each carries a zero-knowledge proof. The server sees verified requests and a throwaway number, never who sent them or whether two came from the same agent." |
| 1:45–2:35 | Same terminal: `… agent --identity N --cheat "one call too many"`; the line `REJECTED (violation)`; server log `[violation]`, commit hash, reveal hash; the feed shows a red `violation` row and the slash row | "Using a request number twice leaks the agent's secret. The server recovers it and claims the deposit in two steps, commit then reveal, so nobody watching the network can copy the claim and steal the reward." |
| 2:35–2:55 | Explorer: the reveal transaction (success) and the `Slashed` event; `/operator` showing the agent `slashed` | "Half the stake goes to the slasher, the rest is locked. The cheater's identity can never come back." |
| 2:55–3:00 | Repo URL on screen | "Open source, testnet, unaudited. Contracts, SDKs and middleware. Link below." |

### If something fails on camera
- Passkey prompt does nothing: it only works on `https://quota-metro.vercel.app`. Re-record that segment from the deployed site.
- "needs more MON": top up the console wallet (`pnpm fund`), wait about 30 s, reload.
- Violation but no slash: the slasher wallet is underfunded; the server log says so. Fund it and re-run with a new identity.
- Feed empty: `FEED_URL` was set after `pnpm dev` started; restart the web dev server.

### Do not say
"Anyone can see the mempool" (Monad has no global mempool; the realistic front-runner is a leader or RPC operator) · "audited" · "mainnet" · "BTX" · "proves you are human" · "global rate limit" (quotas are per server) · that the CLI/Scout passkey is a human tap (it is a software stand-in).

## B. Pitch (≤ 2:00)

Fill in team names and the integrator once known (owner).

| Time | Beat | Script |
|---|---|---|
| 0:00–0:20 | Problem | "Agents now send a huge share of traffic. Free APIs and MCP servers must stop one agent flooding them, and every fix costs something: API keys log everything, IP limits punish honest users, CAPTCHAs block the agent, per-call payments are public, and private-token schemes put one company in charge." |
| 0:20–0:50 | Idea | "QUOTA: stake once, prove you are within your limit on every request, stay anonymous. Cheat and you lose the deposit. No issuer, no accounts. Apple and Cloudflare's private rate limits, without the company in the middle." |
| 0:50–1:20 | Why it is hard and what we built | "Three things: zero-knowledge proofs we reuse rather than invent, passkey custody verified on Monad's own P-256 support, and a slash path a block leader cannot front-run. Plus Privy wallets with a policy so a hijacked agent cannot drain you." |
| 1:20–1:45 | Who and traction | "[Team]. [Named integrator and what they run, if confirmed.] Service integration takes minutes: one middleware line." |
| 1:45–2:00 | Honest close | "It is a testnet prototype with unaudited contracts, and quotas are per server. We built it so a service can be generous without being naive. Thank you." |

## C. Optional 30 s ad
One shot of the `/service` page, one of the enroll tap, one of the slash transaction; caption: "Private rate limits. No one in charge." Skip if time is short.
