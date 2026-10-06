# Why not roll your own?

You run an API or MCP server and want to stop one agent from flooding it. The four things people usually try, and what QUOTA does instead.

| If you build… | What goes wrong | With QUOTA |
|---|---|---|
| **API keys / accounts** | every call is tied to an identity, so you keep a log of what each agent does; agents cannot fill in signup forms | callers are anonymous: you verify a proof, not an identity |
| **IP rate limits** | shared cloud IPs punish honest agents; abusers rotate proxies for pennies | the limit follows a staked identity, not an address |
| **A private-token scheme** (Privacy Pass style) | private, but one issuer decides who gets in, and you must run or trust it | no issuer: membership is a deposit in a public contract |
| **Pay per call** | every payment is public, many endpoints do not want to charge, and it needs a payments integration | no per-call payment; cheating costs a stake instead |

## What you would have to build and get right yourself

1. **The zero-knowledge part.** A proof that "I am in the set and this is request *k* of my *N*" with a leak-on-reuse secret. We do not write circuits: we reuse the PSE RLN-v2 circuit and its public ceremony output, pinned by checksum. You would be choosing between trusting that work or doing a ceremony yourself.
2. **Passkey custody on-chain.** WebAuthn verification is easy to get subtly wrong (challenge binding, origin, rpId, user-verification flags, signature malleability, replay). Ours is a strict parser with 16 negative tests (19 tests in all), bound to chain, registry, operator, action and a nonce. A passkey is for custody, **not** proof of a unique human; the stake provides the sybil cost.
3. **A slash path that cannot be front-run.** A secret that anyone can use to claim a reward will be copied by whoever sees the transaction first. On Monad the likely copier is a leader or RPC operator. We use commit–reveal and ship a test that proves the naive version is stolen and ours is not. (It is commit–reveal, not BTX; BTX is not available to us.)
4. **The boring parts.** Merkle-tree sync that matches the circuit, a recent-roots window so removals take effect on a known schedule, a nullifier store, per-server external nullifiers so quotas do not collide, and wallet adapters (Privy for agents, Dynamic for service wallets) that sign but let you broadcast.

## What you get

- A one-line middleware for Express, Hono and MCP servers (`@quota/server`), and a client that attaches a proof to a request (`@quota/client`).
- A service quickstart that was timed at 2 min 27 s on a clean Windows setup (`docs/quickstart-service.md`).
- A tested contract set, and a documented list of what is **not** defended: [`threat-model.md`](threat-model.md).

## Honest limits

- Our contracts are **unaudited**; this is a testnet prototype.
- The operator is public at enrollment, and anonymity depends on how many agents are enrolled. On the current testnet that is very few.
- Quotas are **per server**, not global.
- Proof generation takes about 0.4–1.2 s (medians measured on laptops), so this is for tool servers and APIs, not latency-critical endpoints.
- If you need to know *who* your callers are, or you want to charge them, this is the wrong tool.
