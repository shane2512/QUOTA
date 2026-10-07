# QUOTA — Phases 0–8

Window: **1 Oct → 13 Oct** (submit a day early; deadline 14 Oct 09:29 IST). Phases overlap, and dates are targets. Each phase ends with an **exit check** you can run, not a feeling.

**Cut order if time runs out:** Cleanverse → Nansen → Dynamic. **Never cut:** passkey custody, RLN proofs, slash safety path, Privy, Qwen agent, docs, demo video.

---

## Phase 0 — Gates and setup (1–2 Oct)
Goal: kill unknowns before writing real code.

- [ ] Monorepo, `.env.example`, public GitHub repo, grant `metropolis@hackathon.monad.xyz`.
- [x] Foundry + Node toolchain; hello contract deployed to Monad testnet (`docs/gates.md` G0).
- [x] Confirm testnet chain ID, RPC, faucet, explorer (`docs/gates.md` G0).
- [x] **Gate BTX:** no public interface found; **commit–reveal is primary** (organizers confirmed BTX unavailable). See `docs/gates.md` G1.
- [x] **Gate Privy (PASS):** `personal_sign` deterministic? policy covers what? sign-only works on Monad?
- [x] **Gate Dynamic (PARTIAL):** sign-only Monad tx PASS; delegated-access webhook untested → server-wallet fallback; SDK is Linux/macOS only.
- [x] **Gate Cleanverse (FAIL → dropped):** no invitation code; only third-party mock addresses found.
- [x] Nansen: `labels` returns data for a Monad address; `related-wallets`/`counterparties` blocked by credits.
- [ ] Qwen: DEFERRED by owner (not free). Decide alternative before Phase 7.
- [ ] Start integrator outreach (parallel, continues to Phase 8).
- [ ] Community group decision.

**Exit:** a `docs/gates.md` listing each gate PASS/FAIL with evidence. Scope is now fixed from it.

## Phase 1 — Contracts: custody and registry (2–4 Oct)
- [x] `PasskeyAuth`: WebAuthn assertion verification via `0x100` (all checks in PRD C2).
- [x] Test vectors: valid, wrong challenge, wrong origin, wrong rpId, missing UP/UV, high-s, replayed nonce, malformed JSON.
- [x] `QuotaRegistry`: tree (Poseidon), `registerPasskey`, `enroll`, `topUp`, `requestUnstake`/`unstake`, recent-roots window.
- [x] Measure enroll gas on Monad: `eth_estimateGas` 1,299,685 on registry v2, depth 20 (`docs/deployments.md`).
- [x] Deployed to testnet. [x] Explorer source verification: v3 (current) verified on Sourcify; v2/v1 are superseded and show no match.

**Exit:** `forge test` green incl. all negative cases; a real browser passkey assertion verifies on-chain on testnet.

## Phase 2 — ZK: RLN proofs (3–6 Oct)
- [x] Vendor and checksum RLN-v2 artifacts; pick tree depth (PSE ceremony `rln-20`, depth 20 = registry depth).
- [x] `@quota/client` prover: `signRequest` with epoch/`k` tracking.
- [x] `@quota/server` verifier + nullifier store + secret recovery from two shares.
- [x] Recent-roots sync from the registry (tree rebuilt from `LeafSet` events; roots checked with `isKnownRoot`).
- [x] Benchmark proof gen/verify and record real numbers (`docs/progress.md`).
- [x] Proof against an **on-chain** root: done in the Phase 3 e2e on registry v2 (3 proofs verified with `isKnownRoot` over RPC).

**Exit:** script: 3 honest requests verify; a 2nd use of the same `k` recovers `a0` exactly; per-server external nullifier prevents cross-server collisions.

## Phase 3 — Slash and BTX path (5–7 Oct)
- [x] Slash with leaf recompute and payout: `commitSlash(keccak256(a0, receiver, salt))` → `revealSlash(a0, receiver, salt, siblings, path)` in a later block. Pays `SLASH_SHARE_BPS` (5000), burns the rest, works while Unstaking, marks `Slashed`.
- [x] `SubmitPath`: `CommitRevealPath` only (organizers confirmed BTX unavailable).
- [x] **Searcher test** (forge, `test/Slash.t.sol`): the naive one-step slash is stolen by a front-runner; on commit–reveal the copied reveal (`NoCommitment`), a same-block commit+reveal (`RevealTooEarly`) and a later reveal (`NotSlashable`) all fail.
- [x] Slasher service (`@quota/slasher`): violation → dedupe → queue → commit → reveal (→ `removeSlashedLeaf` if the tree moved).
- [x] Also shipped in the same redeploy: `limit ≤ 65535` (circuit range), on-chain `leaves()` for fast tree sync.

**Exit:** on-chain slash with reward received; copy-and-steal test result documented. **PASSED 2026-10-04** (`pnpm --filter @quota/slasher phase3` on Monad testnet; txs in `docs/deployments.md`).

## Phase 4 — SDKs, middleware, demo MCP server (6–8 Oct)
- [x] `@quota/server` middleware: `quotaExpress`, `quotaHono`, MCP `quotaTool` (proof in `params._meta["quota/proof"]`), `SqliteNullifierStore`.
- [x] `@quota/slasher` with the wallet adapter interface; `LocalKeyWallet` (done in Phase 3).
- [x] Reference MCP server (`apps/demo-mcp`): `web_search` over live Wikipedia, REST twin, optional slashing; demo agent with `--cheat`.
- [x] Client: `deriveSecret` (W2), `RegistryMembership`, `quotaFetch`, `quotaToolMeta`, persistent `FileUsageStore`.
- [x] Quickstarts: `docs/quickstart-service.md`, `docs/quickstart-agent.md`.
- [x] Time service quickstart (`docs/quickstart-service.md`): clean machine 28 s; walkthrough run 2m 27s ≤ 10m limit. **PASSED 2026-10-05**.
- [ ] Named external integrator (deferred by owner).

**Exit:** a stranger (or a clean machine) follows the service quickstart in ≤ 10 minutes. **PASSED 2026-10-05:**
- A fresh service following `docs/quickstart-service.md` verbatim went 401 without proof (`{"error":"quota","reason":"missing"}`) → 200 for staked agent (`{"hello":"anonymous staked agent"}`) on Monad testnet registry v2.
- Total wall-clock time: 2m 27s (well under the 10-minute threshold).

## Phase 5 — Wallet integrations (7–9 Oct)
- [x] **Privy:** server wallet with owner = operator's Privy user (created server-side), runtime key as additional signer with an override policy, secret derived from a Privy signature, sign-only. Interactive operator *login* (console) is Phase 7.
- [x] **Dynamic:** server-wallet slasher (macOS; key share backed up to Dynamic, no local share). Rewards land in that wallet. Delegated access / embedded-wallet login not done (webhook unproven).
- [x] Both through `@quota/wallets` adapters (`PrivyAgentWallet`, `DynamicServiceWallet`). Contracts and SDK core import neither provider.
- [x] Negative tests: policy rejects other contracts, a value over the cap, another chain and other messages (live, `privy-policy-check.ts`, 10/10).
- [x] Identity rotation: `deriveSecret(sign, n)` signs `QUOTA/rln-secret/v1/n` (n > 0), since a slashed identity can never re-enroll.

**Exit:** the end-to-end flow runs with Privy on the agent side and Dynamic on the service side, no private keys in `.env` except sponsor auth keys.
- **Flow: PASSED 2026-10-05 on Monad testnet.** It ran both via `phase5-e2e.ts` and through the demo MCP server (the Privy agent cheats, the server's Dynamic slasher slashes).
- **Key rule: partially met.** The demo agent and slasher now use no local keys. But `.env` still holds `DEPLOYER_PRIVATE_KEY` (deploying and funding test wallets), the test-only `DEMO_OPERATOR_PASSKEY`, and the old `AGENT_PRIVATE_KEY` / `SLASHER_PRIVATE_KEY`. The old ones are fallbacks, unused when the Privy/Dynamic ids are set.

## Phase 6 — Trust tiers (8–10 Oct) — **CUT 2026-10-06** (Nansen: free tier 10 credits/day; it indexes Monad mainnet, so testnet operators return empty data; gates.md G5)
- [ ] **Nansen Screener:** profile a new operator wallet (labels, related wallets, funding, counterparties), sign attestation, Screened tree accepts it; recidivism rule against slashed wallets.
- [ ] Service console shows tree choice, cluster/concentration stats, slash history.
- ~~Cleanverse Compliant tree~~ — cut at Phase 0 (gate failed).
- [ ] "Remove it and it breaks" check for each: write one test where the tier fails closed without the sponsor component.

**Exit:** a screened enrollment succeeds for a clean wallet and is refused for a related-to-slashed wallet; (if CVI) a non-verified wallet cannot receive CVA. If neither works by 10 Oct, cut and move on.

## Phase 7 — Scout agent, consoles, deploy (9–11 Oct)
- [x] **Scout (model pending):** tool-calling loop with `quota_status`, `call_tool`, `topup_stake`, `switch_server` over ≥ 2 QUOTA servers (demo-mcp `search` + `summary`), behind a provider-agnostic OpenAI-compatible planner.
  - All four tools exercised live on Monad v3 with a **scripted plan (test tooling, no model)**, including an on-chain `topup_stake` (`topUp` + `changeLimit`) and proofs against the new leaf.
  - [ ] **Qwen run:** the owner is getting sponsor credits (`QWEN_*` in `.env`).
- [x] Violation script for the slash demo: `demo-mcp agent --cheat` (Phase 4/5) and `phase5-e2e` (v3 slash, profitable for the slasher).
- [x] **Registry v3** on the public domain `quota-metro.vercel.app`: one-pass slash removal (reveal −29% gas), unit 0.1 MON, verified on Sourcify. Privy policy repointed (1 MON cap).
- [x] Service console live (`/service`: registry state from Monad + the demo server's request feed when `FEED_URL` is set).
- [x] Operator console built (`/operator`: Privy login, real passkey, enroll / add stake / unstake / withdraw); server code verified live on Monad with a software passkey. [ ] Real-browser login + hardware passkey on the public domain: owner to test. [ ] Test credentials for judges and funded judge wallets.
- [x] Contracts verified (v3); root `README.md` with access instructions (CLI path; no console yet).
- [x] Draft the Qwen **article** (`docs/qwen-article-draft.md`, with sections marked pending a real Qwen run).

**Exit:** a judge with only the README can log in, enroll, watch Scout work, and see a slash. **Not yet met:**
- There is no console login yet.
- Scout has not run with a model.
- The README path works from the CLI with funded keys.

## Phase 8 — Hardening, media, submission (11–13 Oct)
- [x] Secrets scan of the tree and all commits: `pnpm scan:secrets` ALL CLEAR on 2026-10-07 (control test confirmed it catches a planted value). [x] `forge coverage` on custody and slash paths (Phase 3/4 records). [ ] Re-run on submission day.
- [x] Threat model (`docs/threat-model.md`) + "why not roll your own" page (`docs/why-not-roll-your-own.md`), written 2026-10-06 from the code and tests.
- [ ] **Technical demo video (≤ 3 min, live product, no slides):** enroll with passkey → agent makes anonymous requests → violation → slash lands. Show the tx. Script and pre-flight: `docs/demo-video-script.md`. Record after the Chrome test (`docs/chrome-test-plan.md`).
- [ ] **Pitch video (≤ 2 min):** team, problem, why. Script: `docs/demo-video-script.md` §B (needs team names).
- [ ] Optional 30 s ad. Logo/graphic (JPG/PNG/WEBP ≤ 3 MB).
- [x] Per-bounty descriptions written (`docs/bounties.md`: Track 4, Privy, Dynamic claimed with stated limits; Qwen, Nansen, Cleanverse not claimed). [ ] Optional sponsor videos.
- [ ] Publish the Qwen article; link it.
- [ ] Record the integrator evidence (a PR, a running URL, or a message).
- [ ] Submit by the evening of 13 Oct. Leave a buffer for portal problems.

**Exit:** every deliverable in the checklist below is ticked and its URL opens in a private window.

---

## Submission checklist
- [ ] Public repo (access for `metropolis@hackathon.monad.xyz`)
- [ ] Live product on Monad + access instructions + test credentials
- [ ] Technical demo video ≤ 3 min · Pitch video ≤ 2 min · Logo ≤ 3 MB
- [ ] Track 4 selected, plus bounties: Privy, Dynamic*, Qwen, Nansen*, Cleanverse*, Community* (*= only if kept after gates)
- [ ] Qwen article URL
- [ ] No secrets in repo or history
- [ ] Named integrator evidence

## Day plan at a glance

| Day | 1–2 Oct | 2–4 | 3–6 | 5–7 | 6–8 | 7–9 | 8–10 | 9–11 | 11–13 |
|---|---|---|---|---|---|---|---|---|---|
| Phase | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
