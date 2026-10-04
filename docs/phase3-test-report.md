# Phase 3 Test Report — QUOTA Slash (Commit–Reveal)

**Tested:** 2026-10-05 · Machine: Windows (separate session) · No edits made to code.

---

## Exit Checks from HANDOFF.md §8 — locally verified

| Exit Check | Status |
|---|---|
| `forge test` 84 passed | ✅ PASS |
| `pnpm test` 17 passed | ✅ PASS |
| `pnpm typecheck` clean | ✅ PASS |
| Coverage: `QuotaRegistry` ≥ 98.25% lines, `PasskeyAuth` 100% | ✅ PASS |
| Searcher (copy-and-steal) forge tests | ✅ PASS |
| On-chain slash on Monad testnet (slasher needs top-up to re-run) | ⚠️ Documented PASS 2026-10-04; not re-run |

---

## 1. Forge Tests — `forge test`

**84 passed, 0 failed, 0 skipped ✅**

### Slash.t.sol — SlashTest (15 tests)

| Test | Result |
|---|---|
| `test_slash_paysShareBurnsRestRemovesLeaf` | ✅ PASS |
| `test_reveal_sameBlock_reverts` | ✅ PASS |
| `test_reveal_withoutCommit_reverts` | ✅ PASS |
| `test_reveal_wrongSaltOrReceiver_reverts` | ✅ PASS |
| `test_slash_twice_reverts` | ✅ PASS |
| `test_slash_unknownSecret_reverts` | ✅ PASS |
| `test_slashed_cannotReenrollOrUnstake` | ✅ PASS |
| `test_slash_duringUnstaking_dodgeFails` | ✅ PASS |
| `test_staleSiblings_paysThenRemovalCompletes` | ✅ PASS |
| `test_revertingReceiver_revertsWholeSlash` | ✅ PASS |
| `test_commit_firstBlockKept` | ✅ PASS |
| `test_searcher_naiveSlash_isStolen` | ✅ PASS |
| `test_searcher_commitReveal_cannotSteal` | ✅ PASS |
| `test_searcher_exactCopy_paysCommittedReceiver` | ✅ PASS |
| `test_idCommitmentMatchesCircuitPoseidon1` | ✅ PASS |

### Slash.t.sol — LimitAndLeavesTest (5 tests — Phase 3 redeploy features)

| Test | Result |
|---|---|
| `test_enroll_limitAboveCircuitRange_reverts` | ✅ PASS |
| `test_enroll_maxLimitOk` | ✅ PASS |
| `test_changeLimit_aboveCircuitRange_reverts` | ✅ PASS |
| `test_leaves_and_memberIndex` | ✅ PASS |
| `test_constructor_fullShare_reverts` | ✅ PASS |

### Coverage — `forge coverage` (standard, without `--ir-minimum`)

| Contract | % Lines | % Branches | % Funcs |
|---|---|---|---|
| `PasskeyAuth.sol` | **100.00%** (42/42) | 92.31% (12/13) | **100.00%** (4/4) |
| `QuotaRegistry.sol` | **98.83%** (169/171) | **80.56%** (29/36) | 95.65% (22/23) |
| Total | 99.06% (211/213) | 83.67% (41/49) | 96.30% (26/27) |

> **`--ir-minimum` artefact:** `test_commit_firstBlockKept` fails only under `forge coverage --ir-minimum`
> (`assertion failed: 1 != 6`). The Yul IR rewriter changes how `block.number` is tracked inside
> the coverage harness. Passes correctly under `forge test` and standard `forge coverage`.
> Not a functional defect.

---

## 2. pnpm Unit Tests — `pnpm test`

**17 passed, 0 failed ✅**

| Package | Tests | Result |
|---|---|---|
| `@quota/core` | 9 | ✅ All PASS |
| `@quota/server` | 5 | ✅ All PASS |
| `@quota/slasher` | 3 | ✅ All PASS |

**`@quota/slasher` unit tests:**
- `slashCommitment equals Solidity keccak256(abi.encode(a0, receiver, salt))` ✅
- `slasher rejects a secret that does not match the idCommitment` ✅
- `slasher dedupes concurrent violations for one secret, and allows a retry after failure` ✅

---

## 3. TypeScript Typecheck — `pnpm typecheck`

**Clean, 0 errors ✅** — all 4 packages pass.

---

## 4. Live Testnet e2e

Not re-run. Slasher wallet balance: ~0.016 MON (needs ≥ 0.3 MON to re-run).
Full PASS evidence from 2026-10-04 is in `docs/progress.md` and `docs/deployments.md`.

---

## Verdict

**Phase 3 is confirmed COMPLETE. All locally runnable exit checks PASS.**
**Ready to start Phase 4.**

Pre-work before next slash:
- Top up slasher wallet (≥ 0.3 MON from faucet).
- Slash economics (0.284 MON gas cost, breaks even at 0.57 MON stake) — deferred to Phase 7.
