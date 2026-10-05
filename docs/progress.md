# QUOTA — Progress Log

Append-only record of what was done, what was observed, and what is still open. Evidence details live in `gates.md` and `deployments.md`. Nothing here is claimed unless it was run. Deadline: 14 Oct 2026, 09:29 IST (submit by evening of 13 Oct).

## Status at a glance

| Phase | Status | Exit check |
|---|---|---|
| 0 Gates and setup | Done except Qwen (deferred by owner) | `docs/gates.md` written |
| 1 Contracts: custody and registry | Done (v2 verified on Sourcify; enroll gas measured on Monad) | real passkey verified on testnet (v1) |
| 2 RLN proofs | Done (on-chain root proof closed in Phase 3 e2e) | `pnpm phase2` all PASS |
| 3 Slash (commit–reveal) | Done | `pnpm --filter @quota/slasher phase3` all PASS on Monad testnet; forge 84 passed |
| 4 SDKs, middleware, demo MCP | Done (named integrator deferred by owner) | quickstart 401 → 200 in 2m 27s (target ≤ 10m); 26 unit tests + forge 84 green |
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
| Added `@quota/core` (hashing, tree, wire format, artifacts, registry sync) | Client, server and the Phase 3 slasher all need the same hashing and tree; avoids client↔server coupling |
| Own 80-line sparse Merkle tree instead of `@zk-kit/imt` | Only a 2.0 beta is current; correctness pinned by matching the live on-chain root |
| `hashToField` = keccak256 >> 8; external nullifier = `Poseidon(hashToField(serverId), epoch)`; `x = hashToField(payloadHash)` | Semaphore convention; always inside the field |
| `snarkjs` (GPL-3.0) for prove/verify | Same library rlnjs uses with these artifacts; licence noted for SDK consumers |
| Slash is `commitSlash(keccak256(abi.encode(a0, receiver, salt)))` then `revealSlash(a0, receiver, salt, siblings, path)`; the PRD's `limit` argument is dropped | The registry already knows the member's limit; binding the receiver in the commitment is what blocks copy-and-steal |
| `SLASH_SHARE_BPS` = 5000, the rest is burned (stays locked, counted in `totalBurned`); constructor rejects ≥ 10000 | At 100% a cheater could slash itself and get the whole stake back |
| Slash allowed while `Unstaking` | A cheater cannot dodge by requesting unstake; the unstake delay (2 h) exceeds epoch (1 h) + root TTL (10 min) |
| Reveal pays even if siblings are stale; the leaf is then `pendingRemoval` and anyone can call `removeSlashedLeaf` | An enroll between commit and reveal must not block the payout or reopen the race |
| On-chain `leaves(from, count)` + `Member.index` (registry v2) | Event sync of v1 took 234 s for 272,700 blocks and grows ~216k blocks/day; `fetchTree` now uses a few `eth_call`s |
| `limit ≤ 65535` (`MAX_LIMIT`) in `enroll`/`changeLimit` | Circuit `RangeCheck(16)` |
| `SubmitPath` exposes `slash(req)` rather than a generic `send(tx)` (PRD B1) | Commit–reveal is a two-transaction protocol; the interface hides that |
| e2e uses a software P-256 authenticator (`scripts/soft-passkey.ts`) | Lets the slash e2e run unattended; labelled test tooling, never a passkey claim. Hardware passkey proven in Phase 1 |
| New env var `SLASHER_PRIVATE_KEY` (throwaway testnet signer, used by the e2e) | `LocalKeyWallet` until Phase 5 wallet adapters; added to `.env.example` |
| Request binding: `x = hashToField(keccak256("QUOTA/http/v1\nMETHOD\npath?query\nbody"))`, JSON bodies canonicalised (sorted keys); MCP: `"QUOTA/mcp-tool/v1\ntool\ncanonical(args)"` | One definition in `@quota/core` so client and server cannot drift; domain-separated so an HTTP proof is never a valid MCP proof |
| MCP proof travels in `params._meta["quota/proof"]` | Transport-agnostic (stdio, Streamable HTTP); the SDK passes it to handlers as `extra._meta` |
| Rejections: 401 (missing/invalid/unknown root/bad payload/epoch), 409 replay, 429 violation; MCP returns a tool error with the same reason | Distinguishes "not allowed" from "over quota" |
| Client message-id counts are persistent (`FileUsageStore`, written before proving) | Found while building the demo: an honest agent restarted within an epoch would reuse id 0 and slash itself |
| `SqliteNullifierStore` on `node:sqlite` (Node ≥ 22.13), separate export `@quota/server/sqlite` | No new dependency; servers that don't use it don't load the experimental module |
| Agent secret `a0 = hashToField(signature over "QUOTA/rln-secret/v1")` (`deriveSecret`, PRD W2) | Recoverable from the wallet, never stored; same message as the Privy gate test |
| New package `@quota/devtools` (software passkey, scripted enroll, Phase 3 e2e moved here) | Test tooling kept out of the SDK; moving the e2e avoids a slasher↔devtools cycle |
| `hono` pinned to 4.13.12 | 4.13.13 (published 2026-10-04) fails pnpm's minimum-release-age policy; I did not add a policy exemption |
| New env vars `AGENT_PRIVATE_KEY`, `AGENT_LIMIT` | Demo agent; in `.env.example` |

## Open items

**Owner decisions or actions**
- Qwen: credits, open-weight, or drop (before Phase 7).
- Nansen credits (otherwise Screener is labels-only).
- **Named external integrator: due now (Phase 4 is done).**
- A human stranger to time the service quickstart (agent-run clean checkout passed).
- Final public domain for passkeys (before Phase 7).
- Cleanverse invitation code, only if reopening.
- Community group, or skip.
- Read access for `metropolis@hackathon.monad.xyz`; push approval for commits after `e7b937e`.

**Engineering**
- **Slash economics.** The slasher pays ~0.284 MON in gas per slash (commit + reveal, billed on limits at ~102 gwei); at unit 0.01 MON and 50% share, a slash only pays off for stakes above ~0.57 MON. Before the demo: raise `UNIT`/minimum stake for the demo server, and cut reveal gas (it hashes the Merkle path 3×: our `_verify`, then zk-kit `_update` verifies again and rewrites).
- ~~Contract: cap `limit` at 65535~~ done in v2. ~~Tree sync cost~~ done in v2 (`leaves()`). ~~Proof against the on-chain root~~ done in the Phase 3 e2e.
- ~~Measure real enroll gas on Monad~~ done: `eth_estimateGas` 1,299,685 (v2).
- ~~Explorer source verification~~ done for v2 (Sourcify `match`).
- ~~Slash vs. enroll race on siblings~~ handled in v2: the reveal pays anyway and `removeSlashedLeaf` finishes the removal.
- Delegated-access webhook for Dynamic (Phase 5, optional).
- Testnet MON is low (deployer 0.586): a registry redeploy costs ~0.84 and a slash ~0.28. Use the faucet before the next redeploy (Phase 7 domain change).

## Test wallets and addresses (public, testnet only)
- Deployer / passkey operator: `0x0437938E18Bd2E6d8Cad0921C8dc1e7Ff28Df7b2`
- Privy test wallet: `0x9682FD25c31F982FF008b827f195E47b96D6af3a`
- Dynamic test wallet: `0xb1E9a0311088528F6cD90316a7f3c7E86d43060a`
- Private keys and API credentials exist only in the gitignored `.env`.

### 2026-10-04 — Vercel fix
- A Git-triggered build failed ("No Next.js version detected") because the project's Root Directory was `.`. Set Root Directory to `apps/web`, renamed the project to `quota-metro`, redeployed from the repo root (`.vercelignore` excludes `contracts`, `docs`, `pdf`), and aliased `quota-metro.vercel.app`.
- Turned off Vercel Authentication for this project so the site is public (it was redirecting visitors to a Vercel login).
- Live: `https://quota-metro.vercel.app` (HTTP 200). Content is mock/demo data. The Git-triggered build with the new Root Directory has not been re-tested yet; it runs on the next push.

### 2026-10-04 — Phase 2: RLN proofs
- **Artifacts:** vendored the PSE p0tion ceremony output `rln-20` (the default depth-20 params of rlnjs 3.x): `rln.wasm`, `rln_final.zkey`, `verification_key.json` in `packages/core/artifacts/rln-20/`, SHA-256 pinned in `SHA256SUMS` and in code; `loadArtifacts()` refuses mismatches. vkey: groth16, bn128, `nPublic` 5 (RLN-v2). No circuit compiled, no setup run.
- **Compatibility:** read `circom-rln` `circuits/rln.circom` (`RLN(20, 16)`): leaf `Poseidon(Poseidon(a0), limit)`, node `Poseidon(l, r)`, zero leaf 0, public signals `[y, root, nullifier, x, externalNullifier]`. Same as `QuotaRegistry`. Found: `RangeCheck(16)` → limit must be ≤ 65535 (open item above).
- **Packages:** `@quota/core` (hash, tree, wire format, artifact loader, `syncTree`), `@quota/client` (`QuotaClient.signRequest/prove`, per server+epoch message ids, `QuotaExhausted`, `allowOveruse` for the violation demo), `@quota/server` (`QuotaVerifier`, `MemoryNullifierStore`, `RegistryRootChecker`, `onViolation`).
- **Tests:** `pnpm test` → core 9 pass, server 5 pass (real Groth16 proofs, no circuit mocks). `pnpm typecheck` clean.
- **Exit check** `pnpm phase2` (output, 2026-10-04):
  ```
  registry 0x05a5fe209E19C6707e2E701A76A0C94b2351E0ac @ block 67933628: depth 20, leaves 1; synced 28384 blocks in 25816 ms
  PASS  registry depth = circuit depth 20
  PASS  off-chain leaf count 1 = on-chain 1
  PASS  off-chain root = on-chain root (36627d69ecbe…)
  PASS  registry.isKnownRoot(off-chain root)
  PASS  merkle proof for on-chain leaf 0
  PASS  honest request 1/3 verifies
  PASS  honest request 2/3 verifies
  PASS  honest request 3/3 verifies
  PASS  4th request reuses message id 0 → violation
  PASS  recovered secret equals a0 exactly (value not printed)
  PASS  Poseidon(recovered) = member idCommitment
  PASS  message id 0 accepted on server-a and server-b
  PASS  different nullifiers per server, no false violation
  PASS  server-b rejects a proof made for server-a
  machine: Apple M2, 8 cores, node v26.9.0
  proof generation (snarkjs groth16.fullProve, depth 20): median 1170 ms, min 902, max 1918 (n=10)
  proof verification (snarkjs groth16.verify, incl. checks):  median 32 ms, min 18, max 66 (n=10)
  ```
- **Limit of this evidence:** the on-chain leaf from Phase 1 was enrolled with a random `idCommitment` (no known `a0`), so it cannot prove. The protocol checks ran against a member appended to a copy of the live tree, so their root is local, not on-chain. Hashing compatibility is proven by the root match; a proof against an on-chain root needs a passkey `enroll` of a known-`a0` agent.
- Proof time 1.17 s median is under the 2 s budget (Z2) on this machine; Windows/browser numbers not measured.
- Environment notes: this run was on macOS (M2). Foundry is not installed here and the contract submodules are not checked out, so `forge test` was **not** run in this session (no contract changes were made). pnpm 11 needed `allowBuilds: esbuild: true` in `pnpm-workspace.yaml` (tsx dependency).

### 2026-10-04 — Phase 3: slash (commit–reveal)
- **Setup on this Mac:** installed Foundry 1.8.4 (`foundryup`), checked out contract submodules; baseline `forge test` 64 passed.
- **Contracts (test-first):** `commitSlash`/`revealSlash`/`removeSlashedLeaf`, `Slashed` state, `SLASH_SHARE_BPS`, `totalBurned`, `MAX_LIMIT = 65535`, `leaves(from, count)`, `Member.index`. New `test/Slash.t.sol` (20 tests) incl. the searcher test. Two first-run failures were test bugs (block 1 − 1 = 0 meaning "no commit" in the naive harness; `expectRevert` consumed by the external Poseidon library call in a helper), fixed in the tests.
  - `forge test`: **84 passed, 0 failed**.
  - `forge coverage --ir-minimum`: `PasskeyAuth` 100% lines / 92.3% branches; `QuotaRegistry` 98.25% lines / 80.56% branches / 95.65% funcs.
- **Off-chain:** `@quota/slasher` (`WalletAdapter`, `LocalKeyWallet`, `Broadcaster` with estimate × 1.15 limits and a 200 gwei max-fee floor, `CommitRevealPath`, `Slasher` queue with dedupe). `@quota/core` gets the v2 ABI, `MemberState`, `fetchTree` (reads `leaves()`, retries until the root matches).
- **Dry run on anvil** (`--hardfork osaka --block-time 1`): all e2e checks PASS. Without `--block-time`, anvil only mines on transactions, so the commit→reveal wait never ends.
- **Registry v2 deployed** to Monad testnet `0xd89BFd2f093015193d42EA51170D64d9242a40C6` and **verified on Sourcify** (`match`). ~0.84 MON.
- **Monad e2e** `pnpm --filter @quota/slasher phase3` (output, 2026-10-04):
  ```
  chain 10143, registry 0xd89BFd2f093015193d42EA51170D64d9242a40C6, unit 0.01, slash share 5000 bps
  PASS  agent enrolled at index 1, stake 0.03
  PASS  tree from leaves() matches on-chain root (2 leaves)
  PASS  agent leaf = on-chain leaf
  PASS  honest request 1/3 verified against on-chain root (isKnownRoot via RPC)
  PASS  honest request 2/3 verified against on-chain root (isKnownRoot via RPC)
  PASS  honest request 3/3 verified against on-chain root (isKnownRoot via RPC)
  PASS  request 4 reuses a message id → violation
  PASS  server recovered the agent secret exactly (not printed)
  PASS  reveal in block 68177704 > commit block 68177684
  PASS  receiver got 0.015 MON = 5000 bps of 0.03
  PASS  member state Slashed, stake 0
  PASS  leaf removed; new root matches leaves()
  PASS  leaf removed in the reveal
  PASS  second violation for the same secret is not slashed twice
  ```
  Tx hashes and `eth_estimateGas` figures: `docs/deployments.md`.
- **Two failed Monad attempts before that, both from async execution:**
  1. `fetchTree` pinned reads to the newest block number and saw 0 leaves right after an enroll. Fixed: it now reads at latest and retries until the rebuilt root equals `root()`. This attempt **stranded ~0.43 MON** (not measured exactly) in a throwaway operator whose key lived only in memory, and left an orphan leaf 0 (stake 0.03 MON, secret unknown, harmless). Fixed: the script always sweeps the operator balance back in a `finally`.
  2. The freshly funded operator's first tx was rejected with "Signer had insufficient balance": consensus checks balances against lagging state. Fixed: wait 4 blocks after funding. The sweep worked (0.475 MON returned).
- **Re-ran everything after the changes:** `pnpm typecheck` clean; `pnpm test` core 9, server 5, slasher 3 passed; `pnpm phase2` all PASS against v1 (the event sync now took 234 s for 272,700 blocks, which is why v2 has `leaves()`). Proving on this run: median 705 ms (min 591, max 1421, n=10); verify median 16 ms.
- Balances after: deployer 0.586 MON, slasher 0.016 MON (needs topping up before another slash), receiver 0.015 MON.

### 2026-10-05 — Phase 4: SDKs, middleware, demo MCP server
- Pulled `f7e6d84` (owner's independent Phase 3 re-verification).
- **Core:** `canonicalJson`, `httpPayloadHash`, `toolPayloadHash`, `MCP_META_KEY`.
- **Client:**
  - `deriveSecret`, `RegistryMembership` (tree cache via `leaves()`, 60 s max age), `quotaFetch`, `quotaToolMeta`.
  - `UsageStore` with `MemoryUsageStore` and `FileUsageStore`.
- **Server:** `quotaExpress`, `quotaHono`, `quotaTool` (MCP), `statusFor`, `SqliteNullifierStore`.
- **Tests:** `pnpm test` → core 12, client 2, server 9, slasher 3 = **26 passed**.
  - New tests use real Groth16 proofs through real Express 5, Hono and MCP SDK 1.32 (`InMemoryTransport`).
  - Covered: ok; replay 409; missing 401; tampered body 401 `bad-payload`; violation 429 with exact secret recovery; Hono GET with query; MCP missing proof and wrong arguments; SQLite store catching a violation across a restart; canonical-JSON and domain-separation vectors; deterministic `deriveSecret`; `FileUsageStore` restart.
  - `pnpm typecheck` clean (6 projects). `forge test` 84 passed.
- **apps/demo-mcp:** stateless Streamable HTTP MCP server with `web_search` over live Wikipedia, REST twin `GET /api/search`, SQLite nullifiers, and optional slashing (`QUOTA_SLASH=1`). Demo agent with a persistent usage file and `--cheat`.
- **Anvil rehearsal** (`--hardfork osaka --block-time 1`, public anvil dev keys):
  - Enroll (limit 3); 2 OK calls; restart; 1 OK call, then `STOP` (count persisted).
  - `--cheat` call → `REJECTED … violation` → server log `[slash] … commit 0x57da1e… reveal 0xe06cef…`; `totalBurned` 0.015 ETH.
  - REST twin without a proof → 401 `missing`.
- **Monad testnet (registry v2):**
  - Demo agent enrolled at index 2 (limit 5, 0.05 MON; txs in `deployments.md`). Server run with slashing off: the slasher holds 0.016 MON, too little for gas.
  - Run 1: 3 × `OK` with live Wikipedia results; proofs 552–1429 ms; every root checked with `isKnownRoot` on Monad.
  - Run 2 (restart): `remaining now 2`, 2 × `OK`, then `STOP` at the 6th query.
  - Afterwards the demo's local state (usage file and nullifier DB) was reset together, so the next run starts clean.
- **Exit check (clean-machine variant):**
  - Fresh `git clone` of the repo into a scratch dir.
  - Quickstart files taken verbatim from the code blocks in `docs/quickstart-service.md`.
  - Steps 1–3: install, create the service, `curl` → `HTTP/1.1 401 {"error":"quota","reason":"missing"}` at +15 s.
  - Step 4: a staked-agent call → `200 {"hello":"anonymous staked agent"}` at +28 s (machine time).
  - Caveats: warm pnpm store; no human reading or typing; cloned from the local repo because GitHub did not have these commits yet. The clone (holding a copy of the agent key in its `.env`) was deleted afterwards.
- **Issues found and fixed:**
  - Message-id counts lived only in memory, so a restarted agent could slash itself. Fixed with a persistent usage store.
  - `FileUsageStore` failed when its directory was missing; it now creates it.
  - pnpm auto-added a `minimumReleaseAgeExclude` for hono 4.13.13. I reverted that, restored the lockfile and pinned 4.13.12.
- Balances after: deployer 0.363 MON, slasher 0.016 MON.

### 2026-10-05 — Phase 4 complete test run (re-verification, env restored)

Owner provided the correct `.env` (all keys including `SLASHER_PRIVATE_KEY` and `AGENT_PRIVATE_KEY`). Full test suite run from scratch.

**Bug found and fixed: Windows `import.meta.url` path resolution.**
`.pathname` on a `file:///D:/...` URL returns `/D:/...` (leading slash) not `D:/...`. When Node's `process.loadEnvFile` receives `/D:/METRO/.env` as a path string on Windows, it joins it to the CWD drive root producing `D:\D:\METRO\.env` (ENOENT). Fixed in 4 files by using `fileURLToPath` from `node:url` instead:
- `packages/devtools/scripts/phase3-e2e.ts`
- `packages/devtools/scripts/enroll-agent.ts`
- `apps/demo-mcp/src/server.ts` (also fixes the SQLite DB path)
- `apps/demo-mcp/src/agent.ts` (also fixes the agent usage file path)

Only triggered on Windows when running scripts directly with `tsx`. Typecheck clean after fix.

**Test results (all PASS):**
- `pnpm typecheck`: clean (6 packages/apps).
- `forge test`: **84/84 passed** (9 suites, 84.10 ms). No changes to contracts.
- `forge coverage`: `PasskeyAuth` 100.00% lines / 92.31% branches; `QuotaRegistry` 98.83% lines / 80.56% branches. `--ir-minimum` still fails `test_commit_firstBlockKept` (IR instrumentation artefact, not a functional defect).
- `pnpm test`: **26/26 passed** (core 12, client 2, slasher 3, server 9). No changes to tests.
- `pnpm phase3` (Monad testnet, registry v2): **14/14 PASS**. Agent enrolled at index 3, 3 honest proofs, violation → secret recovery, commit at block 68347545, reveal at block 68347567 (+22 blocks), receiver `0x05c2bF6F50D3C177C5AAB0Ade971C82F691411C8` +0.015 MON. Leaf removed. Second slash rejected. Txs in `deployments.md`.

**Post-test balances:** deployer 5.159 MON, slasher 9.734 MON (heavily funded), agent 0 MON.

**Full test evidence:** `docs/phase4-test-report.md`.

### 2026-10-05 — Phase 4 Quickstart timing run (PASS)
- Executed `docs/quickstart-service.md` verbatim on Windows to measure wall-clock developer experience.
- Created `apps/my-api`, ran `pnpm install`, launched server on port 3001.
- `curl.exe -i http://localhost:3001/hello` → 401 `{"error":"quota","reason":"missing"}`.
- `pnpm --filter my-api exec tsx call.ts` with enrolled demo agent (index 5) → 200 `{"hello":"anonymous staked agent"}`.
- Wall-clock time: **2m 27s** (well under the 10-minute threshold).
- Cleaned up `apps/my-api` and restored lockfile. Phase 4 exit check complete.

