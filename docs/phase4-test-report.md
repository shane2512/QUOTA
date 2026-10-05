# Phase 4 Test Report — 2026-10-05

## Summary

Full Phase 4 test suite run on 2026-10-05 (IST). All checks pass.
Bug fixed during this run: Windows `import.meta.url` path resolution (`.pathname` → `fileURLToPath`) in
`packages/devtools/scripts/phase3-e2e.ts`, `packages/devtools/scripts/enroll-agent.ts`,
`apps/demo-mcp/src/server.ts`, `apps/demo-mcp/src/agent.ts`.

---

## 1. Typecheck — PASS

```
$ pnpm typecheck
Scope: 6 of 8 workspace projects
packages/core typecheck: Done
packages/client typecheck: Done
packages/slasher typecheck: Done
packages/server typecheck: Done
packages/devtools typecheck: Done
apps/demo-mcp typecheck: Done
```

**Result: clean across all 6 packages/apps. 0 errors.**

---

## 2. Forge tests — 84/84 PASS

```
$ forge test
Ran 9 test suites in 84.10ms: 84 tests passed, 0 failed, 0 skipped (84 total tests)
```

| Suite | Tests |
|---|---|
| PoseidonTest | 1 |
| RootsTest | 4 |
| RegisterPasskeyTest | 8 |
| EnrollTest | 14 |
| TopUpUnstakeTest | 12 |
| ChangeLimitTest | 6 |
| PasskeyAuthTest | 19 |
| LimitAndLeavesTest | 5 |
| SlashTest | 15 |
| **Total** | **84** |

---

## 3. Forge coverage — PASS (unchanged)

| File | % Lines | % Statements | % Branches | % Funcs |
|---|---|---|---|---|
| src/PasskeyAuth.sol | 100.00% (42/42) | 98.75% (79/80) | 92.31% (12/13) | 100.00% (4/4) |
| src/QuotaRegistry.sol | 98.83% (169/171) | 96.33% (210/218) | 80.56% (29/36) | 95.65% (22/23) |

Note: `forge coverage --ir-minimum` still fails `test_commit_firstBlockKept` under Yul IR instrumentation only — not a functional defect (documented in HANDOFF §8b).

---

## 4. pnpm unit tests — 26/26 PASS

| Package | Tests | Result |
|---|---|---|
| @quota/core | 12 | PASS |
| @quota/client | 2 | PASS |
| @quota/slasher | 3 | PASS |
| @quota/server | 9 | PASS |
| **Total** | **26** | **0 failed** |

New tests since Phase 3:
- `core`: `canonicalJson sorts keys recursively`, `JSON bodies hash the same regardless of key order`, `payload hash changes with method/path/query/body/tool/args`
- `client`: `FileUsageStore: a restarted agent continues its message-id count instead of reusing ids`
- `server`: `mcp: tool call with proof in _meta succeeds`, `sqlite store: violation is caught across a server restart`, `honest requests verify, then the client refuses to exceed its limit`, `reusing a message id with a different payload recovers the secret exactly`, `the same message id on two servers never collides`

---

## 5. Phase 3 e2e — 14/14 PASS (Monad testnet, re-run 2026-10-05)

```
chain 10143, registry 0xd89BFd2f093015193d42EA51170D64d9242a40C6, unit 0.01, slash share 5000 bps
PASS  agent enrolled at index 3, stake 0.03
PASS  tree from leaves() matches on-chain root (4 leaves)
PASS  agent leaf = on-chain leaf
PASS  honest request 1/3 verified against on-chain root (isKnownRoot via RPC)
PASS  honest request 2/3 verified against on-chain root (isKnownRoot via RPC)
PASS  honest request 3/3 verified against on-chain root (isKnownRoot via RPC)
PASS  request 4 reuses a message id -> violation
PASS  server recovered the agent secret exactly (not printed)
PASS  reveal in block 68347567 > commit block 68347545
PASS  receiver got 0.015 MON = 5000 bps of 0.03
PASS  member state Slashed, stake 0
PASS  leaf removed; new root matches leaves()
PASS  leaf removed in the reveal
PASS  second violation for the same secret is not slashed twice
```

### Transactions (Monad testnet, chain 10143)

| Step | Tx | Notes |
|---|---|---|
| Fund operator `0x4093D5e7E8...` | `0xaaf8d1fd93cae980d8e6b16afdee2fdb038ffbafcfac9fdea168a28854c66ec7` | estimate 21,000 |
| `registerPasskey` | `0xceaaa437698012b8d0dc8a6dc766c85ced56123994b85892b949b39f4db32113` | estimate 131,851 |
| `enroll` (index 3, stake 0.03) | `0xd65a1e18c04a5d59bf6d6b644032f0be1463b5c94af60527a1bb3b7029f577d5` | block 68347530, estimate 1,290,928 |
| `commitSlash` | `0x57006a5d001b427165ea75e13ab974a810fe00f6c6c3d56b0c6ebcd49017c47b` | block 68347545, estimate 51,914 |
| `revealSlash` | `0xfee479d1e5cac3771eb46ac1a996f3ed872c45e6fdb93668ede121bb51a83430` | block 68347567 (+22 blocks), estimate 2,352,585 |
| Sweep to funder | `0xf05078b0a7db9fa9e922b1602f7edac36b05680b1ec800a146de16b2a5101fe2` | 0.278 MON returned |

Slasher: `0xb7B8388B9878f2d450C16623420Ed0CE8C0C237f`
Receiver: `0x05c2bF6F50D3C177C5AAB0Ade971C82F691411C8`

---

## 6. Bug found and fixed: Windows fileURLToPath

`import.meta.url` `.pathname` on Windows returns `/D:/...` (leading slash), producing double-drive paths
(`D:\D:\...`) when used with Node's file system APIs. Fixed by using `fileURLToPath` from `node:url` in 4 files:

- `packages/devtools/scripts/phase3-e2e.ts`
- `packages/devtools/scripts/enroll-agent.ts`
- `apps/demo-mcp/src/server.ts`
- `apps/demo-mcp/src/agent.ts`

Only triggered on Windows when running scripts directly with tsx. Typecheck clean after fix.

---

## 7. Post-test wallet balances

| Wallet | Address | Balance |
|---|---|---|
| Deployer | `0x0437938E18Bd2E6d8Cad0921C8dc1e7Ff28Df7b2` | 5.159 MON |
| Slasher | `0xb7B8388B9878f2d450C16623420Ed0CE8C0C237f` | 9.734 MON |
| Agent (demo, index 2) | `0x87A971cEb7F67e4A44CbAa111Dc28Ef16711bF20` | 0 MON |

---

## 8. Quickstart Timing Run — PASS (2026-10-05)

Service quickstart from `docs/quickstart-service.md` executed step-by-step:
1. Created `apps/my-api/package.json` & `apps/my-api/server.ts` matching guide.
2. Ran `pnpm install` and launched server on port 3001.
3. Unauthenticated request:
   ```
   $ curl.exe -i http://localhost:3001/hello
   HTTP/1.1 401 Unauthorized
   {"error":"quota","reason":"missing"}
   ```
4. Authenticated request with enrolled agent (index 5):
   ```
   $ pnpm --filter my-api exec tsx call.ts
   200 {"hello":"anonymous staked agent"}
   ```
5. Server log stayed clean throughout.
6. Timing:
   - Start: 13:54:40 IST
   - Complete: 13:57:07 IST
   - Total wall-clock time: **2m 27s** (Target: ≤ 10m). **PASS.**

---

## 9. Remaining

- **External integrator** — named person outside the team to integrate the SDK (deferred by owner).
- **npm publish** — needs owner approval.
- **Slash economics** — at unit 0.01 MON and 50% share, a slash pays off only when stake > ~0.57 MON. Fix at Phase 7 redeploy.

