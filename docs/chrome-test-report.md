# QUOTA — Chrome test report

Fill this in while running [`chrome-test-plan.md`](chrome-test-plan.md). **PASS only if you saw it work yourself.** Use BLOCKED (with the reason) for anything you could not run.

- Tester: Claude Code (agent), partial run 2026-10-09: CLI C1–C4 and HTTP-level checks only. Chrome extension was not connected, so every visual P/S/O check is still NOT RUN; O and X2–X5 need a human (Privy email code + hardware passkey).
- Date:
- Chrome version / OS / passkey device:
- Production deployment tested (commit or URL):

| ID | Result (PASS / FAIL / BLOCKED / NOT RUN) | Evidence (tx hash, screenshot path) | Notes |
|---|---|---|---|
| P1 | NOT RUN | | |
| P2 | NOT RUN | | |
| P3 | NOT RUN | | |
| P4 | NOT RUN | | |
| P5 | NOT RUN | | |
| P6 | NOT RUN | | |
| P7 | NOT RUN | | |
| P8 | NOT RUN | | |
| P9 | NOT RUN | | |
| S1 | NOT RUN | | |
| S2 | NOT RUN | | |
| S3 | NOT RUN | | |
| S4 | NOT RUN | | |
| S5 | NOT RUN | | |
| S6 | NOT RUN | | |
| S7 | PASS (HTTP) | `/api/service` keys: at, chain, chainError, feed, feedError; chain = registry, block, leaves 4 (2 active, 2 removed), balance 0.9 MON, burned 0.25 MON; no secrets | curl, not Chrome; feed null (no demo server hosted) |
| O1 | NOT RUN | | |
| O2 | NOT RUN | | |
| O3 | NOT RUN | | |
| O4 | NOT RUN | | |
| O5 | NOT RUN | | |
| O6 | NOT RUN | | |
| O7 | NOT RUN | | |
| O8 | NOT RUN | | |
| O9 | NOT RUN | | |
| O10 | NOT RUN | | |
| O11 | NOT RUN | | |
| O12 | NOT RUN | | |
| O13 | NOT RUN | | |
| O14 | NOT RUN | | |
| O15 | NOT RUN | | |
| O16 | NOT RUN | | |
| O17 | NOT RUN | | |
| O18 | NOT RUN | | |
| O19 | NOT RUN | | |
| O20 | NOT RUN | | |
| O21 | NOT RUN | | |
| O22 | NOT RUN | | |
| O23 | NOT RUN | | |
| O24 | NOT RUN | | |
| O25 | NOT RUN | | |
| O26 | NOT RUN | | |
| O27 | NOT RUN | | |
| O28 | NOT RUN | | |
| O29 | NOT RUN | | |
| O30 | NOT RUN | | |
| O31 | NOT RUN | | |
| O32 | NOT RUN | | |
| O33 | NOT RUN | | |
| O34 | NOT RUN | | |
| X1 | PASS (HTTP) | `curl /api/operator/me` → 401 `{"error":"log in first"}` (2026-10-09) | checked with curl, not in Chrome |
| X2 | NOT RUN | | |
| X3 | NOT RUN | | |
| X4 | NOT RUN | | |
| X5 | NOT RUN | | |
| X6 | PASS (HTTP) | POST `/api/operator/relay` without auth → 401 | curl, not Chrome |
| X7 | PASS (HTTP) | POST relay with `Bearer abc` → 401 "invalid or expired session; log in again" | curl, not Chrome |
| X8 | NOT RUN | | |
| X9 | NOT RUN | | |
| C1 | PASS | `pnpm typecheck` 0 errors (2026-10-09) | macOS |
| C2 | PASS | core 12, client 3, slasher 3, server 10, wallets 3, demo-mcp 2, scout 4, web 6 | matches plan |
| C3 | PASS | forge 89 passed | |
| C4 | PASS | `pnpm scan:secrets` ALL CLEAR (10 values, 64 commits) | |
| C5 | NOT RUN | | |
| C6 | NOT RUN | | |
| C7 | NOT RUN | | |
| C8 | NOT RUN | | |
| C9 | NOT RUN | | |
| C10 | NOT RUN | | |
| C11 | NOT RUN | | |
| C12 | NOT RUN | | |
| C13 | NOT RUN | | |
| C14 | NOT RUN | | |

## Bugs

| # | Title | Steps to reproduce | Expected vs actual | Evidence |
|---|---|---|---|---|
| | | | | |
