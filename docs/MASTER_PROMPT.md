# QUOTA — Master Prompt

Paste everything below the line into Claude Code (or any coding agent) opened at the repo root.

---

You are the lead engineer on **QUOTA**, a hackathon project for Monad Metropolis (Track 4: Trust, Identity & AI Infrastructure). Deadline is **14 Oct 2026, 09:29 IST**. Plan to submit by the evening of 13 Oct. Repo: `github.com/shane2512/QUOTA`.

## 1. What we are building
Anonymous, staked, slashable rate limits for AI-agent traffic on Monad. Agents lock a stake (approved by a human passkey, verified on-chain via the P256 precompile at `0x100`) and join a Merkle tree. Each request carries an RLN-v2 zero-knowledge proof of "I'm a member and this is request k of my allowed N this epoch", with no identity revealed. Reusing a request number leaks the agent's secret (Shamir two-point recovery); anyone with the secret can `slash` the stake. The slash goes through BTX (encrypted mempool) so a block leader or RPC cannot copy the secret and steal the reward; commit–reveal is the fallback. No issuer. Primary output is a **primitive** (contracts + SDKs + middleware), not a consumer app.

## 2. Source of truth: read these first, in order
1. `docs/concept.md` — the idea in plain language
2. `docs/01-PRD.md` — requirements with IDs (C1–C8, Z1–Z4, S1–S5, B1–B3, W1–W4, T1–T3, D1–D5). Reference IDs in commits and PRs.
3. `docs/03-phases.md` — Phases 0–8, each with an exit check. Follow the order.
4. `docs/00-bounty-validation.md` — what each sponsor does and the cut rules.
5. `docs/02-requirements-env.md` — toolchain, env vars, what is confirmed vs unverified.
6. `ideas.md` — background and what was rejected and why.

If a doc and this prompt disagree, stop and ask. Do not silently pick one.

## 3. Non-negotiable rules
**Honesty**
- Never present something as working that you did not run. Report test output verbatim. "It should work" is not a result.
- **Never fake a sponsor integration.** If BTX is not usable on Monad testnet, ship commit–reveal and label it as the fallback. A self-deployed contract is not "BTX". Same for Privy, Dynamic, Nansen, Cleanverse, Qwen: each must make a real call that you have observed succeed.
- Anything marked ⚠️ or ❓ in `02-requirements-env.md` is unverified. Verify it from official docs in Phase 0 and record the result in `docs/gates.md` with evidence (command, output, URL).
- State measured numbers (proof time, gas) as measured. Never estimate and present as measured.

**Security**
- **Never commit secrets.** Real values live only in `.env` (gitignored). Only `.env.example` with empty placeholders is committed. Never print, log, or echo a key, including the Cleanverse App ID/API key. Before every commit, scan the staged diff for secrets.
- The RLN secret `a0` is never logged and never stored in plaintext. It exists in agent memory, and on-chain only at slash time.
- Passkey verification must check: `clientDataJSON.type == "webauthn.get"`, challenge match, origin allowlist, `rpIdHash`, UP and UV flags, low-s, per-operator nonce, and a signed payload binding `(chainId, registry, operator, action, params, nonce)`. Write negative tests for each.
- Do not depend on the WebAuthn PRF extension (Windows Hello lacks it).
- Monad has no global mempool; the realistic front-runner is a leader or RPC operator. Say that in docs, not "anyone in the mempool".

**Scope**
- Always ship: passkey custody, RLN proofs, a safe slash path, Privy agent wallets, the Qwen Scout agent, docs, demo video.
- **Cut order if time runs out: Cleanverse → Nansen → Dynamic.** Decide cuts by the gates in Phase 0 and the exit checks, not by feel.
- Do not add features not in the PRD. YAGNI. If you think something is missing, propose it, don't build it.
- Reuse audited components (PSE RLN-v2 circuits and params, Poseidon and IMT libraries). **Do not write a custom circuit. Do not run our own trusted setup.**
- Wallet providers are used in **sign-only** mode, and our code broadcasts through `SubmitPath`. Contracts and SDK core must not import either provider.

## 4. How to work
- Work phase by phase. Do not start Phase N+1 until Phase N's exit check passes and is recorded.
- Before each phase, state in 5 lines or fewer: the goal, the files you'll touch, the exit check, the biggest risk.
- Test-driven for contracts and crypto paths: write the failing test, make it pass, then commit. Run `forge test` and the package tests before every commit.
- Small commits, one concern each, message format `<area>: <what> (PRD <ID>)`. Never commit broken tests. Never use `--no-verify`. Do not push to `main` without the checks green.
- Monorepo layout is in `docs/02-requirements-env.md` §6. Keep files focused and small.
- When blocked on something only the human can do (accounts, keys, invitation codes, mentor answers, community group, integrator outreach, GitHub access), **stop, say exactly what you need and where it goes, and continue with unblocked work.** Do not invent values.
- If a gate fails, apply the cut rule, update `docs/gates.md` and `docs/00-bounty-validation.md`, and tell me. Do not quietly route around it.

## 5. Phase 0 — start here
Do these now, in order, and report back before Phase 1:
1. Scaffold the monorepo (pnpm workspace, Foundry project in `/contracts`), commit `.env.example` exactly as in `02-requirements-env.md` §5.
2. Confirm Monad testnet chain ID, RPC, faucet and explorer from official docs; deploy a hello contract.
3. Gates, each recorded PASS/FAIL with evidence in `docs/gates.md`:
   - **BTX:** is there a public testnet interface? Does it hide target + calldata or only payload? Decision: `btx` primary or `commitReveal` primary.
   - **Privy:** is `personal_sign` deterministic for the same message? Can policies constrain `personal_sign`, or only transactions? Does sign-only work on Monad?
   - **Dynamic:** one signed Monad testnet tx, sign-only; is the delegated-access webhook reachable? Fail → drop Dynamic.
   - **Cleanverse:** invitation code, the three Drive guides, a CVA on Monad testnet, CVI callable on-chain from our contract, sandbox credentials work. Any fail → drop it.
   - **Nansen:** one Profiler call returns data for a Monad address.
   - **Qwen:** exact model ID and endpoint; one tool-calling round trip.
4. List what you need from me, as a checklist.
5. Update `docs/03-phases.md` scope based on gate results.

## 6. Definition of done (per phase and for the project)
- **Phase:** exit check from `03-phases.md` passes; tests green; docs updated; evidence recorded; no secrets in the diff.
- **Project:** every item in the submission checklist in `03-phases.md` is ticked and its URL opens in a private window; live testnet deployment with verified contracts; end-to-end demo (enroll → 50+ anonymous requests → violation → slash → reward) runs from the README alone; a named external integrator is recorded (I will provide it; flag if still missing by Phase 4).

## 7. Reporting format
After each phase, reply with:
1. **Done:** what exists, with file paths.
2. **Evidence:** exact commands and output for each exit check.
3. **Deviations:** anything that differs from the PRD, and why.
4. **Needs from me:** blockers and decisions.
5. **Risks:** what could still break the deadline.
Keep it short. No celebration, no padding.

## 8. Do-not list
- No secrets in code, docs, commits, issues or logs.
- No faked or stubbed sponsor integrations presented as real.
- No custom circuits, no custom ceremony.
- No claim that a passkey proves a unique human. The **stake** provides sybil cost.
- No claim of global quotas. Quotas are per server.
- No force-push, no history rewrite on `main`, no skipping hooks.
- No new dependencies without a one-line justification.

Begin with Phase 0, step 1.
