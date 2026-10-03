# QUOTA — Progress Log

Append-only record of what was done, what was observed, and what is still open. Evidence details live in `gates.md` and `deployments.md`. Nothing here is claimed unless it was run. Deadline: 14 Oct 2026, 09:29 IST (submit by evening of 13 Oct).

## Status at a glance

| Phase | Status | Exit check |
|---|---|---|
| 0 Gates and setup | Done except Qwen (deferred by owner) | `docs/gates.md` written |
| 1 Contracts: custody and registry | Done, two items open (explorer verification, Monad gas measurement) | 64 tests green; real passkey verified on testnet |
| 2 RLN proofs | Not started | |
| 3 Slash (commit–reveal) | Not started | |
| 4 SDKs, middleware, demo MCP | Not started | |
| 5 Wallet integrations | Not started | |
| 6 Trust tiers (Nansen only) | Not started | |
| 7 Scout agent, consoles, deploy | Not started | |
| 8 Hardening and submission | Not started | |

## Log

### 2026-10-02 — Phase 0 start
- Read `concept.md`, PRD, phases, bounty validation, requirements, and the master prompt. No conflicts found between docs and prompt.
- Scaffolded the monorepo: `package.json`, `pnpm-workspace.yaml`, Foundry project in `contracts/`, `.env.example` identical to requirements §5. `forge-std` pinned as a submodule (v1.17.0). A nested git repo created by `forge init` was removed.
- Confirmed from official docs: testnet chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, faucet `https://faucet.monad.xyz`, explorers `testnet.monadvision.com` / `testnet.monadscan.com`. Live check: `cast chain-id` returned `10143`; P256VERIFY at `0x100` returned `1` for a valid vector.
- Commits: scaffold; gates record.

### 2026-10-03 — Phase 0 gates run live
- Owner confirmed BTX is unavailable and Qwen is not free. Owner supplied credentials (kept in gitignored `.env`; never printed).
- Deployed Hello to testnet `0x30A8e23D…Cf`, verified by calls.
- **Privy: PASS.** `personal_sign` identical across 3 calls; `eth_signTransaction` for chain 10143 signed, decoded, broadcast, status 1. Test wallet had no owner or policy.
- **Dynamic: PARTIAL.** Server wallet created and a Monad tx signed and broadcast (status 1). Delegated-access webhook not tested. SDK native module does not support Windows, so it runs under WSL Ubuntu.
- **Nansen: PARTIAL.** `labels` returns data for a Monad address; `related-wallets` and `counterparties` return `insufficient_credits`.
- **Cleanverse: FAIL, dropped.** Docs gated by invitation code; the addresses found publicly belong to another team's mock oracle (`sourceId` = `trustflow-mock-oracle-v1`).
- **BTX: FAIL.** Commit–reveal is the only slash path.
- **Qwen: DEFERRED.** Pick credits, open-weight via free tier, or drop, before Phase 7.
- Learned: Monad rejected a 10 gwei max-fee tx ("Transaction fee too low"); gas price is about 102 gwei.
- Scope updates applied to `03-phases.md` and `00-bounty-validation.md`.

### 2026-10-04 — Push, web deploy, Phase 1
- Pushed `a8b8406..e7b937e`. The push included `e7b937e` (web landing and consoles, "demo data"), a commit I did not author; I scanned it for secrets afterwards (none found) but have not reviewed the code.
- Deployed `apps/web` to Vercel production: `https://quota-web-zeta.vercel.app` (HTTP 200). Included uncommitted local edits to `World.tsx`, `scene3d.ts`, `globals.css`. Content not reviewed; treat as mock data.
- **Phase 1 contracts** (test-first):
  - `PasskeyAuth`: strict clientDataJSON parser, rpIdHash, UP, UV, low-s, origin allowlist, P256VERIFY call that fails closed if the precompile is missing. 19 tests.
  - `QuotaRegistry`: Poseidon IMT (zk-kit + poseidon-solidity, pinned submodules), `registerPasskey`, `enroll`, `topUp`, `changeLimit`, `requestUnstake`, `unstake`, time-based root TTL. Tests include replay, binding to chain/registry/operator/action/params, swapped destination, reentrancy, tree full.
  - Result: `forge test` 64 passed, 0 failed. Coverage: `PasskeyAuth` 100% lines, `QuotaRegistry` 98.3% lines (66.7% branches).
- **Deployment:** registry v0 (superseded) then v1 `0x05a5fe209E19C6707e2E701A76A0C94b2351E0ac` with origins `localhost:3000` and `localhost:3777`. Poseidon library deployed by CREATE2.
- **Real passkey check:** Windows Hello credential created via the local tool. `registerPasskey` tx `0x680fb30a…41a8` and `enroll` tx `0xad7f17bc…9203` both status 1. State confirmed: 1 leaf, nonce 2, stake 0.01 MON. A stale-nonce enroll assertion was correctly not submitted.
- Mistakes made and fixed along the way: a heredoc failure meant a config change and a file removal silently did not apply (caught by test failures and a git listing); one test was invalid (proof siblings do not depend on leaf value) and was rewritten; a first Privy broadcast reverted because of a wrong function selector and was redone with the correct one.

## Decisions and deviations

| Decision | Why |
|---|---|
| Commit–reveal is the only slash path; `btx` removed | Organizers confirmed BTX unavailable (G1) |
| Cleanverse and Compliant tree cut | Gate failed (G4) |
| `enroll` takes `idCommitment` and computes the leaf | Prevents claiming a larger limit than the stake pays for; matches PRD §5 |
| Roots expire by time (TTL), not "last R roots" | Time-bounded removal effect |
| Passkey tests use `evm_version = osaka` | Foundry only exposes `0x100` under that setting |
| Dynamic via server wallet, not delegated access | Webhook flow unproven |
| `changeLimit` implemented | Required by PRD C3 |
| Registry `rpId` and origins are immutable | Redeploy for the final domain in Phase 7 |

## Open items

**Owner decisions or actions**
- Qwen: credits, open-weight, or drop (before Phase 7).
- Nansen credits (otherwise Screener is labels-only).
- Named external integrator (flag due by Phase 4).
- Final public domain for passkeys (before Phase 7).
- Cleanverse invitation code, only if reopening.
- Community group, or skip.
- Read access for `metropolis@hackathon.monad.xyz`; push approval for commits after `e7b937e`.

**Engineering**
- Measure real enroll gas on Monad with `eth_estimateGas` (Foundry model: 1,675,321 at depth 20; Monad bills the gas limit so receipts do not show usage).
- Explorer source verification for the registry.
- Slash needs a Merkle proof against the current root; enrolls can race it (design point for Phase 3).
- Delegated-access webhook for Dynamic (Phase 5, optional).

## Test wallets and addresses (public, testnet only)
- Deployer / passkey operator: `0x0437938E18Bd2E6d8Cad0921C8dc1e7Ff28Df7b2`
- Privy test wallet: `0x9682FD25c31F982FF008b827f195E47b96D6af3a`
- Dynamic test wallet: `0xb1E9a0311088528F6cD90316a7f3c7E86d43060a`
- Private keys and API credentials exist only in the gitignored `.env`.
