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
- [ ] `PasskeyAuth`: WebAuthn assertion verification via `0x100` (all checks in PRD C2).
- [ ] Test vectors: valid, wrong challenge, wrong origin, wrong rpId, missing UP/UV, high-s, replayed nonce, malformed JSON.
- [ ] `QuotaRegistry`: tree (Poseidon), `registerPasskey`, `enroll`, `topUp`, `requestUnstake`/`unstake`, recent-roots window.
- [ ] Measure enroll gas on Monad; apply risk fallback if too costly.
- [ ] Deploy to testnet; verify on explorer.

**Exit:** `forge test` green incl. all negative cases; a real browser passkey assertion verifies on-chain on testnet.

## Phase 2 — ZK: RLN proofs (3–6 Oct)
- [ ] Vendor and checksum RLN-v2 artifacts; pick tree depth.
- [ ] `@quota/client` prover: `signRequest` with epoch/`k` tracking.
- [ ] `@quota/server` verifier + nullifier store + secret recovery from two shares.
- [ ] Recent-roots sync from the registry.
- [ ] Benchmark proof gen/verify and record real numbers.

**Exit:** script: 3 honest requests verify; a 2nd use of the same `k` recovers `a0` exactly; per-server external nullifier prevents cross-server collisions.

## Phase 3 — Slash and BTX path (5–7 Oct)
- [ ] `slash(a0, limit, receiver)` with leaf recompute and payout.
- [ ] `SubmitPath`: `commitReveal` only (organizers confirmed BTX unavailable).
- [ ] **Searcher test:** a bot watches the public path and tries to copy the slash. It must fail on the commit–reveal path and succeed on a naive path (to prove the race is real).
- [ ] Slasher service: violation → queue → slash.

**Exit:** on-chain slash with reward received; copy-and-steal test result documented.

## Phase 4 — SDKs, middleware, demo MCP server (6–8 Oct)
- [ ] `@quota/server` middleware for Express/Hono and an MCP wrapper.
- [ ] `@quota/slasher` with the wallet adapter interface; `LocalKeyWallet` first.
- [ ] Reference MCP server (`apps/demo-mcp`) protected by QUOTA.
- [ ] Quickstarts for both personas; measure a fresh developer's integration time.

**Exit:** a stranger (or a clean machine) follows the service quickstart in ≤ 10 minutes.

## Phase 5 — Wallet integrations (7–9 Oct)
- [ ] **Privy:** operator login, server wallet with owner = operator user, runtime key as additional signer with override policies, secret derivation from signature, sign-only.
- [ ] **Dynamic:** server-wallet slasher on Linux (delegated access only if a webhook is proven); service login/embedded wallet for rewards.
- [ ] Both through `wallets` adapters. Contract and SDK code must not depend on either provider.
- [ ] Negative test: policy blocks a transaction to any contract other than the registry.

**Exit:** the end-to-end flow runs with Privy on the agent side and Dynamic on the service side, no private keys in `.env` except sponsor auth keys.

## Phase 6 — Trust tiers (8–10 Oct) — conditional
- [ ] **Nansen Screener:** profile a new operator wallet (labels, related wallets, funding, counterparties), sign attestation, Screened tree accepts it; recidivism rule against slashed wallets.
- [ ] Service console shows tree choice, cluster/concentration stats, slash history.
- ~~Cleanverse Compliant tree~~ — cut at Phase 0 (gate failed).
- [ ] "Remove it and it breaks" check for each: write one test where the tier fails closed without the sponsor component.

**Exit:** a screened enrollment succeeds for a clean wallet and is refused for a related-to-slashed wallet; (if CVI) a non-verified wallet cannot receive CVA. If neither works by 10 Oct, cut and move on.

## Phase 7 — Scout agent, consoles, deploy (9–11 Oct)
- [ ] **Qwen Scout:** tool-calling loop (`quota_status`, `call_tool`, `topup_stake`, `switch_server`), plans a research task across ≥ 2 QUOTA servers inside quota.
- [ ] Violation script for the slash demo.
- [ ] Operator console + service console deployed with public URLs and test credentials for judges.
- [ ] Contracts verified; README access instructions.
- [ ] Draft the Qwen **article** from the build log.

**Exit:** a judge with only the README can log in, enroll, watch Scout work, and see a slash.

## Phase 8 — Hardening, media, submission (11–13 Oct)
- [ ] Security pass: secrets scan of repo and git history, passkey checks reread, replay tests, `forge coverage` on custody and slash paths.
- [ ] Threat model doc + "why not roll your own" page.
- [ ] **Technical demo video (≤ 3 min, live product, no slides):** enroll with passkey → Scout makes anonymous requests → violation → slash lands. Show the tx.
- [ ] **Pitch video (≤ 2 min):** team, problem, why.
- [ ] Optional 30 s ad. Logo/graphic (JPG/PNG/WEBP ≤ 3 MB).
- [ ] Per-bounty descriptions: how each sponsor is used (see `00-bounty-validation.md`); Dynamic/Privy/Nansen/Cleanverse/Qwen videos where optional.
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
