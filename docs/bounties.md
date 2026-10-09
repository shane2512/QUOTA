# QUOTA — Bounty descriptions (for the submission portal)

Test applied to every sponsor, from `00-bounty-validation.md`: **does QUOTA break, or get materially worse, if this component is removed?** Each section says what is used, what evidence exists, and what is *not* claimed. Evidence is in [`deployments.md`](deployments.md), [`gates.md`](gates.md) and [`progress.md`](progress.md). Status as of 2026-10-07; the Chrome test plan ([`chrome-test-plan.md`](chrome-test-plan.md)) has not been run yet, so browser-side claims are marked accordingly.

## Track 4 — Trust, Identity & AI Infrastructure (primary)

**One line:** anonymous, stake-backed rate limits for AI-agent traffic on Monad, with no issuer in the middle.

- **Trust layer:** a service learns that a caller is *bounded* (staked, within N requests per epoch) without learning *who*. Cheating reveals the cheater's secret and costs their stake.
- **Impossible to capture:** membership is a deposit in a public contract, not a token from a company. The slash path is commit–reveal, so a block leader cannot copy the claim and take the reward (test `Slash.t.sol`: the naive version *is* stolen, ours is not).
- **Custody:** every stake action needs a WebAuthn passkey signature verified on-chain via Monad's P256 precompile at `0x100` (strict parser, 16 negative tests, bound to chain, registry, operator, action and a nonce). A real Windows Hello passkey was verified on-chain in Phase 1; the operator console uses real WebAuthn (browser run pending, Chrome test plan O12–O26).
- **A primitive, not an app:** contracts, SDKs (`@quota/client`, `@quota/server`, `@quota/slasher`, `@quota/wallets`), Express / Hono / MCP middleware, a reference MCP server and an agent. Service quickstart timed at 2 min 27 s.
- **Honest limits:** our contracts are unaudited; testnet only; not proof of personhood; quotas are per server; no BTX (commit–reveal instead, see G1); anonymity depends on how many agents are enrolled (very few today). Full list: [`threat-model.md`](threat-model.md).

## Privy — used beyond login (claimed)

What we use, and why each is needed:

1. **User-owned server wallets.** Each operator logs in with email; the backend creates a Privy server wallet **owned by that user**. This is the on-chain operator.
2. **An additional signer with an override policy.** Our runtime key is registered as an additional signer, bound to a default-deny policy: only transactions to the registry, on chain 10143, value ≤ 1 MON, plus `personal_sign` of the fixed agent-secret message. A hijacked runtime cannot touch any other contract or move more than the cap. Live check: `packages/wallets/scripts/privy-policy-check.ts` (signs what the policy allows and is rejected for other contracts, other chains, other messages; exactly 1 MON signs, 1 MON + 1 wei is rejected).
3. **Policy on `personal_sign`.** The agent's RLN secret is derived from a wallet signature over a fixed domain string (identity *n* signs `…/n`); the policy restricts the wallet to signing only that message prefix. Privy signatures were deterministic in testing (3/3 identical, re-checked 2026-10-07).
4. **Sign-only mode.** We use `eth_signTransaction` and broadcast ourselves, so our own submission path (commit–reveal for slashes) stays in control.
5. **Server-side access-token verification** guards the relay API; the browser uses Privy email login.

Remove-it test: without Privy we would have to build agent key custody, a policy engine and user-owned wallets ourselves (that is the hardest part of running autonomous agents safely). A local-key adapter exists, but only as test tooling.

Not claimed: Privy does not "verify the human"; the operator's passkey and the stake do the custody work. The positive login path in the browser is to be confirmed by the Chrome test plan (O4–O8).

## Dynamic — used on the service side (claimed, live in the deployed app)

**Live now (2026-10-09):** the deployed demo server on Render (`https://quota-demo-mcp.onrender.com`, Linux) slashes through a **Dynamic server wallet**, `0x32b55C25a84c7916152851f862b46EBbED1c4A47`, and holds no raw private key. Judges can see it on `/service` ("Slasher wallet: Dynamic server wallet"). Evidence: a deliberate cheat against the live server produced two violations and an on-chain slash whose commit (`0xb572efbc…41f6`, block 69505362) and reveal (`0x988136f7…a01c`, block 69505393) were both sent from that wallet and succeeded. Details in `HANDOFF.md` §0c.

**Two Dynamic primitives, both live:**
1. **Server wallet:** the slasher is a Dynamic server wallet (above).
2. **Embedded wallet + delegated access:** a service operator opens `/slasher`, signs in with an email code (Dynamic embedded wallet), and approves delegation. Dynamic sends an encrypted `wallet.delegation.created` webhook to `POST /dynamic/webhook` on the demo server, which verifies the HMAC over the raw body, decrypts with our RSA key, keeps the material AES-GCM encrypted at rest, proves control of the wallet by recovering a signed challenge, and then signs slashes from the **operator's own wallet** so the reward lands there. Revoking (`wallet.delegation.revoked`) returns slashing to the server wallet. `/service` shows which wallet is slashing. Evidence on Monad testnet (2026-10-09), two slashes whose commit and reveal were both sent from the operator's embedded wallet `0x48726d79b26f12178069bDf8b98579F9A26AfF8C`: (1) identity 1, commit `0x79ab567bbf082323ffcbac25158a81a09089b15ca88574fd7407ebb0f796cd3d` (block 69525686), reveal `0x9e6df76cc59287fb97ac9cd5690adbf1c0cae91b37f435968c6abf9922b695c4` (block 69525709); (2) identity 2, commit `0x1b8bfb3ffcb30ea57b3b9137cc0e5dfb1dfe3f35dfa06b036c7f25d773334489` (block 69526418), reveal `0xeff5b83f68c86678096fbbd753348b81881e0bc1b26d35b87d5c9c75f0a3c268` (block 69526439). All four `success`. The operator's wallet paid about 0.2 MON of gas and received half of the forfeited stake, so with stakes of 0.1 to 0.2 MON a delegated slasher runs at a small loss; it breaks even from a limit of about 5 (0.5 MON staked).

Older detail follows (earlier Dynamic wallets and slashes).


- **What:** the slasher's wallet is a **Dynamic server wallet** (`TWO_OF_TWO` MPC; our side holds no key share, the external share is backed up to Dynamic under a password). It signs the `commitSlash` and `revealSlash` transactions and **receives the reward**. Sign-only; we broadcast.
- **Evidence:** a slash executed through it on Monad (v3: commit `0xf99d556a…e5f1`, reveal `0x52cd4a80…84c9`, slasher net **+0.0454 MON** after gas), and a cheating agent slashed through the demo MCP server. The adapter retries slow MPC signatures; Dynamic's signing was intermittently slow on testnet.
- **Limits:** delegated access is built and verified on testnet (see above). The delegation lives in the demo server's memory and an encrypted file, and Render's free plan resets its disk on deploy, so an operator must approve again after a deploy; there is one active delegated slasher at a time (the latest approval). The Dynamic Node SDK runs only on Linux or macOS (native module). The wallet password lives in `.env`; losing it strands the wallet (this happened once, `deployments.md`).
- **Remove-it test, stated honestly:** the slasher is behind a wallet-adapter interface, so a local key can replace Dynamic and slashing still works (the agent-side wallet is likewise swappable). The point of using Dynamic is that the service holds no raw key on its server, and that QUOTA is wallet-agnostic (agents on Privy, services on Dynamic, same protocol).

## Qwen — not claimed

No Qwen key or credits were obtained, so Scout has **not** been run with a Qwen model and no article exists beyond the draft (`qwen-article-draft.md`, sections marked pending). The agent loop is provider-agnostic (any OpenAI-compatible endpoint); a scripted run (test tooling, no model) exercises all four tools. Claim this bounty only if a real Qwen run and a published article happen before submission.

## Nansen and Cleanverse — cut

- **Nansen:** the free tier gives 10 credits per day, and Nansen's `monad` chain is mainnet, so every testnet operator returns empty data and would screen "clean". The refusal case could only have been staged (`gates.md` G5). Not claimed.
- **Cleanverse:** docs are behind an invitation code we did not have; the only CVI addresses found were another team's mock (`gates.md` G4). Not claimed.

## Monad Foundation Community Team

Eligibility depends on the team's portal profile naming an onboarded community group. **Owner to decide** whether to select it; no product work is involved.
