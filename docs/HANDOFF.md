# QUOTA — Handoff for the next engineer / agent

You are continuing a hackathon build (Monad Metropolis, Track 4). Deadline **14 Oct 2026, 09:29 IST**; submit by the evening of 13 Oct. Repo: `github.com/shane2512/QUOTA`. Phases 0–5 are done. Phase 6 (Nansen) was **cut** (gates.md G5). Phase 7 is **partly done** (§8g): registry v3 is live on the public domain and a slash is now profitable; Scout is built and its tools are exercised live, but it hasn't run with Qwen yet; there are no consoles. **Continue at §9** (rest of Phase 7, then Phase 8). §8c–8e cover Phase 4 and §8f Phase 5.

## 1. What QUOTA is (one paragraph)
Anonymous, staked, slashable rate limits for AI-agent traffic on Monad. An operator locks a stake (approved by a human passkey, verified on-chain via the P256 precompile at `0x100`); the agent joins a Merkle tree. Each request carries an RLN-v2 zero-knowledge proof of "I am a member and this is request k of my N this epoch". Reusing a request number leaks the agent's secret `a0` (Shamir two-point recovery); anyone with `a0` can slash the stake. No issuer. The primary output is a primitive (contracts, SDKs, middleware), not a consumer app.

## 2. Read first, in this order
1. `docs/concept.md` — idea in plain words
2. `docs/01-PRD.md` — requirement IDs (C1–C8, Z1–Z4, S1–S5, B1–B3, W1–W4, T1–T3, D1–D5). Cite IDs in commits.
3. `docs/03-phases.md` — phases with exit checks. Follow the order.
4. `docs/gates.md` — **what is actually verified vs not.** Read before trusting any sponsor claim.
5. `docs/progress.md` — chronological log, decisions, open items
6. `docs/deployments.md` — addresses and tx evidence
7. `docs/quickstart-service.md`, `docs/quickstart-agent.md` — how the SDK is used
8. `docs/MASTER_PROMPT.md` — the working rules (summarised below). If a doc and the prompt disagree, stop and ask the owner.

## 3. Rules you must keep (from the master prompt)
- **Honesty:** never present something as working that you did not run; paste real output. Never fake a sponsor integration. State measured numbers as measured.
- **Secrets:** never commit them, never print or log them. Real values live only in the gitignored `.env`; only `.env.example` (empty placeholders) is committed. Scan the staged diff before every commit. `a0` is never logged or stored in plaintext.
- **Passkey checks** must stay: type `webauthn.get`, challenge, origin allowlist, rpIdHash, UP, UV, low-s, per-operator nonce, payload binding `(chainId, registry, operator, action, params, nonce)`. Do not use the WebAuthn PRF extension. Do not claim a passkey proves a unique human; the stake provides sybil cost.
- **No** custom circuits, no own trusted setup, no new features outside the PRD, no new dependency without a one-line justification, no `--no-verify`, no force-push, no history rewrite on `main`.
- Monad has no global public mempool. The realistic front-runner is a leader or RPC operator; say that, not "anyone in the mempool".
- Quotas are per server, not global.
- Test-first for contracts and crypto. Small commits: `<area>: <what> (PRD <ID>)`.
- Work phase by phase. Before each phase, state goal, files, exit check and biggest risk in 5 lines. After each phase report: Done / Evidence / Deviations / Needs from owner / Risks.

## 4. Current state

| Phase | State |
|---|---|
| 0 Gates | Done (Qwen deferred by owner) |
| 1 Contracts | Done. v2 verified on Sourcify; enroll gas measured on Monad (`eth_estimateGas` 1,299,685) |
| 2 RLN proofs | Done, including a proof against an on-chain root (closed in the Phase 3 e2e) |
| 3 Slash (commit–reveal) | Done. On-chain slash with reward on Monad testnet; searcher test in forge. **Independently re-verified 2026-10-05: forge 84/84, pnpm 17/17, typecheck clean, coverage confirmed.** |
| 4 SDKs, middleware, demo MCP | Done. Express/Hono/MCP middleware, demo MCP server live against v2, quickstarts; quickstart timing verified in 2m 27s (target ≤ 10m). **Re-verified 2026-10-05: forge 84/84, pnpm 26/26, typecheck clean, phase3 e2e 14/14 PASS on testnet. MCP live demo: 5 × OK + 1 × REJECTED (violation 429) + server-initiated on-chain slash. Windows path bug (fileURLToPath) found and fixed. Active demo agent index 5.** |
| 5 Wallet integrations | Done. Privy agent wallet (owner + policy + additional signer) and Dynamic slasher, live on Monad incl. a slash through the demo MCP server |
| 6 Trust tiers (Nansen) | **Cut** 2026-10-06 (owner): free tier, mainnet-only data (gates.md G5) |
| 7 Scout, consoles, deploy | Partial (§8g): registry v3 + Sourcify, Scout (tools live with a scripted plan), README, article draft. Open: Qwen run, consoles |
| 8 Hardening and submission | Not started |

### Scope decisions already taken
- **BTX does not exist for us** (organizers confirmed). Slash path is **commit–reveal only**; label it as the fallback, never as BTX.
- **Cleanverse dropped** (gate failed). No Compliant tree.
- **Dynamic**: only a server-wallet signing test passed; delegated access untested. Plan W3 as server wallet.
- **Nansen**: `labels` works for Monad; `related-wallets`/`counterparties` need credits the owner does not have yet. Conditional.
- **Qwen**: owner has not decided (credits / open-weight / drop). Keep the agent loop provider-agnostic.
- Cut order if time runs out: Nansen → Dynamic. Never cut: passkey custody, RLN proofs, safe slash path, Privy, the demo agent, docs, demo video.

### What exists
```
contracts/src/PasskeyAuth.sol      WebAuthn verifier (strict parser, P256VERIFY)
contracts/src/QuotaRegistry.sol    tree, passkey registry, enroll/topUp/changeLimit/requestUnstake/unstake,
                                   commitSlash/revealSlash/removeSlashedLeaf, leaves(), MAX_LIMIT
contracts/test/*.t.sol             84 tests, all green (Slash.t.sol has the searcher test)
contracts/script/Deploy.s.sol      deploy script (env-driven; SLASH_SHARE_BPS default 5000)
contracts/tools/passkey-demo/      local page + server to create a real passkey and sign assertions
packages/core/                     @quota/core: Poseidon/field helpers, SparseMerkleTree, proof wire format,
                                   pinned RLN-20 artifacts, registry ABI, fetchTree (leaves()), syncTree (v1 events)
packages/client/                   @quota/client: QuotaClient (prove/signRequest, allowOveruse, UsageStore/FileUsageStore),
                                   deriveSecret, RegistryMembership, quotaFetch, quotaToolMeta
packages/server/                   @quota/server: QuotaVerifier, MemoryNullifierStore, RegistryRootChecker, onViolation,
                                   quotaExpress, quotaHono, quotaTool (MCP); @quota/server/sqlite: SqliteNullifierStore
packages/slasher/                  @quota/slasher: WalletAdapter, LocalKeyWallet, Broadcaster, CommitRevealPath, Slasher
packages/server/scripts/phase2-exit.ts   Phase 2 exit check (`pnpm phase2`, runs against v1)
packages/wallets/                  @quota/wallets: PrivyAgentWallet, agentPolicyRules/createAgentWallet/updateAgentPolicy,
                                   DynamicServiceWallet (+ dynamic-sdk.ts type shim). scripts/: privy-setup, privy-policy-check,
                                   privy-update-policy, enroll-privy-agent, dynamic-create-wallet, probe*, phase5-e2e
packages/devtools/                 @quota/devtools, TEST TOOLING ONLY: SoftPasskey (persistable), enrollWithSoftPasskey,
                                   scripts/enroll-agent.ts (`pnpm --filter @quota/devtools enroll-agent`),
                                   scripts/phase3-e2e.ts (`pnpm phase3`, uses .env)
apps/demo-mcp/                     reference MCP server (web_search over live Wikipedia) + REST twin + demo agent
                                   (`pnpm --filter @quota/demo-mcp start` / `agent "query" ... [--cheat]`)
docs/quickstart-service.md         protect an API in < 10 min (tested on a clean checkout)
docs/quickstart-agent.md           agent side: 5 lines + demo walkthrough
apps/scout/                        Scout (PRD D1): planner (OpenAI-compatible; Qwen via QWEN_*), tools quota_status / call_tool /
                                   switch_server / topup_stake, LiveQuotaAccount (Privy wallet + operator passkey); --scripted = test tooling
README.md                          overview, live addresses, how to run, honest limits
docs/qwen-article-draft.md         article draft; sections needing a real Qwen run are marked PENDING
apps/web/                          Next.js landing + consoles from another contributor; "demo data", not reviewed
docs/                              PRD, phases, gates, deployments, progress
```
Deployed on Monad testnet (chain 10143):
- **Registry v3 (current):** `0xCBdfda8ebF4302793C06a402E9753C4F43799990`, rpId `quota-metro.vercel.app`, origin `https://quota-metro.vercel.app`, unit 0.1 MON, verified on Sourcify. Leaf 0 = Privy identity 0 (slashed by the v3 e2e); leaf 1 = Privy identity 1 (Active, limit 4).
- **Wallets:** Privy agent `0x1Ec0…1aA6`; Dynamic slasher `0xe550…2b15` (new; the previous Dynamic wallet `0x7d15…Aee1` is stranded, its password lost with the old `.env`).
- Registry v2 (superseded): `0xd89BFd2f093015193d42EA51170D64d9242a40C6` (rpId `localhost`), holds the Phase 3–5 evidence.
- Registry v1 (superseded): `0x05a5…0ac`, holds the Phase 1 hardware-passkey evidence.
- Details and tx hashes: `docs/deployments.md`.

## 5. Contract facts you need
- **Leaf** = `Poseidon([idCommitment, limit])`, `idCommitment = Poseidon(a0)`. The contract computes the leaf itself (the PRD's C4 said the caller passes `rateCommitment`; we changed it so a caller cannot claim a bigger limit than the stake pays for).
- Tree: zk-kit `InternalBinaryIMT`, fixed depth (constructor arg; deploy default 20), **zero leaf = 0**, `PoseidonT3` from `poseidon-solidity`. Removal/update need Merkle siblings + path against the **current** root. `leaves(from, count)` returns current leaves (0 = removed) and `members(id).index` gives an agent's index, so `fetchTree` rebuilds the tree with a few `eth_call`s. `LeafSet(index, leaf)` events remain.
- **Passkey challenge** = `keccak256(abi.encode(chainId, registry, operator, uint8 action, keccak256(params), nonce))`. Actions: `0 RegisterPasskey, 1 Enroll, 2 RequestUnstake, 3 ChangeLimit`. Params are `abi.encode` of: register `(x,y)`; enroll `(id, limit, treeId, msg.value)`; unstake `(id, destination)`; changeLimit `(id, newLimit)`. Operator = `msg.sender`. The nonce increments on every successful action.
- **Slash (commit–reveal, not BTX):**
  - `commitSlash(keccak256(abi.encode(a0, receiver, salt)))`, then in a **later block** `revealSlash(a0, receiver, salt, siblings, path)`.
  - The reveal pays `SLASH_SHARE_BPS` (5000) of the stake to `receiver`. The rest is burned (locked; `totalBurned`). A 100% share is rejected because it would make self-slashing free.
  - Works while `Active` or `Unstaking`; the member becomes `Slashed` and can never re-enroll or unstake.
  - If the siblings are stale (the tree moved after they were built), the reveal still pays and sets `pendingRemoval[id]`. Anyone can then call `removeSlashedLeaf(id, siblings, path)`. The slasher does this automatically.
  - Searcher model: a leader/RPC operator copying the reveal gets `NoCommitment` (receiver is inside the commitment). A same-block commit+reveal gets `RevealTooEarly`. Once ours lands, anything later gets `NotSlashable`.
- Members (`members(id)`): `(operator, state, limit, unlockAt, stake, index, destination)`, state `0 None, 1 Active, 2 Unstaking, 3 Withdrawn, 4 Slashed`.
- Roots stay valid for `ROOT_TTL` after being superseded (`isKnownRoot`). Unstake delay (2 h) > epoch (1 h) + root TTL (10 min), so a cheater cannot unstake away from a slash.
- `rpId` and allowed origins are **immutable**. The registry must be redeployed when the final public domain is chosen (Phase 7). A passkey made for `localhost` does not work on another domain.
- `treeId` must be 0 (Screened/Compliant trees were cut). `limit` must be 1..65535 (`MAX_LIMIT`, circuit range).
- **v3 removal:** `revealSlash` and `removeSlashedLeaf` use `_tryRemove`, a single pass over the path that writes nothing unless the old root matches. It updates zk-kit's `lastSubtrees` exactly like `_update`, and `OnePassRemovalTest` pins this against a full recompute. Reveal gas: 1.58M in forge at depth 20, ~1.69M estimate on Monad. `requestUnstake` and `changeLimit` still use zk-kit `_remove`/`_update`.

## 5b. RLN facts (Phase 2)
- Artifacts: PSE p0tion ceremony `rln-20` (rlnjs 3.x defaults), circuit `circom-rln` `RLN(20, 16)`. Public signals in order: `[y, root, nullifier, x, externalNullifier]`. `y = a0 + a1·x`, `a1 = Poseidon(a0, externalNullifier, messageId)`, `nullifier = Poseidon(a1)`.
- `x = hashToField(payloadHash)`; `hashToField` = keccak256 >> 8. External nullifier = `Poseidon(hashToField(serverId), epoch)`, epoch = `floor(unix / epochLength)` (default 3600 s). The verifier accepts the current epoch and one previous one (`epochGrace`).
- Wire format: header `x-quota-proof` = base64url JSON `{proof, signals, epoch}` (`encodeProof`/`decodeProof` in core).
- Verifier order: epoch → external nullifier → payload binding → `isKnownRoot` (RPC, 5 s cache) → Groth16 → nullifier store. Same nullifier + same x = `replay`; same nullifier + different x = `violation` → `onViolation({secret, idCommitment, …})`. Never log `secret`.
- Measured on an Apple M2 (node 26): proving median 1170 ms in one run and 705 ms in another (n=10 each); verify median 16–32 ms. Windows and browser not measured.

## 6. Gotchas that already cost time
- **Back up `.env`.** It was replaced with the teammate's file, which lost the Dynamic wallet password, so a wallet with 0.129 MON is now unrecoverable. Ids are mirrored in `deployments.md`; secrets aren't anywhere else.
- **Monad value transfers:**
  - The sender needs value + gas limit × max fee up front. Monad still *includes* an underfunded transaction, which then reverts and is charged the full gas limit. This cost two v3 enrolls; budget stake + 0.45 MON.
  - Monad also has a 10 MON reserve balance: below it, only a sender's first transaction in the k = 3 block window may spend value. `Broadcaster` waits 4 blocks after its own previous transaction before such a transfer.
  - `cast run` replays don't model either rule.
- **Monad `eth_call` applies the base fee even with `gasPrice: 0`**, so a simulation of a value call fails with "insufficient funds" unless the account holds value + gas.
- **Stopping the demo server:** use `pkill -f "src/server.ts"` and then check `ps`/`lsof -iTCP:8787`. The real command line is `…/tsx/dist/cli.mjs src/server.ts`, so `pkill -f "tsx src/server.ts"` matches nothing. A stray server from Phase 4 answered requests in Phase 5, and a cheat went undetected.
- **Dynamic:**
  - Save the full `walletMetadata` at creation (`DYNAMIC_SLASHER_WALLET`). Without `externalServerKeySharesBackupInfo` a wallet cannot sign, which is why the Phase 0 wallet is unusable.
  - Backing up to Dynamic requires a password (`DYNAMIC_WALLET_PASSWORD`).
  - `getWallets()` returns 404 with API-token auth; use `getWalletByAddress`.
  - Signing is intermittently slow (timeouts after 300 s / ~99 s); the adapter retries 3×.
  - Its `.d.ts` cannot be resolved under NodeNext, hence `packages/wallets/src/dynamic-sdk.ts`.
- **Privy:**
  - Policy rule names must be < 50 characters.
  - Creating a user by an email that already exists fails; `createAgentWallet` reuses the user by email.
  - Policies are default-deny.
  - Our key is an additional signer under an *override* policy; the operator user (owner) is not restricted.
- **A registered passkey can't be replaced.** Persist the software operator passkey (`DEMO_OPERATOR_PASSKEY`) or the operator is locked out; the first Privy wallet was lost this way.
- **A slashed identity can never re-enroll:** use the next `--identity n` (`deriveSecret(sign, n)`).
- **Foundry only exposes the P256 precompile under `evm_version = "osaka"`** (set in `contracts/foundry.toml`). Under `prague` the call returns empty and valid signatures fail. `PasskeyAuth` fails closed when the precompile is missing.
- **Monad bills the gas limit**, not gas used. Receipts show your limit as `gasUsed`. Use `eth_estimateGas` (the `Broadcaster` sends estimate × 1.15). Monad rejected a 10 gwei max fee; gas price is ~102 gwei, so scripts use a max-fee floor of 200 gwei. The sender's balance must cover limit × max fee + value, even though only limit × effective price is charged.
- **Monad executes asynchronously; this cost two failed runs and ~0.43 MON:**
  - An `eth_call` pinned to the newest block number can return state from before that block's transactions. `fetchTree` reads at latest and retries until the root matches `root()`.
  - A freshly funded account's first transaction is rejected ("Signer had insufficient balance") because consensus checks lagging state. Wait ~4 blocks after funding.
- **Never keep a funded throwaway key only in memory.** The e2e sweeps the operator's balance back in a `finally`.
- **anvil:** run with `--hardfork osaka --block-time 1`. Osaka is needed for P256. Without block time, anvil only mines on transactions, so the commit→reveal wait never ends.
- **Persist the agent's message-id count** (`FileUsageStore`). With the in-memory default, a restarted agent reuses id 0 within the epoch and the server treats it as a violation, i.e. the agent slashes itself. If you reset a demo, delete the agent usage file **and** the server's nullifier DB together.
- **Stop the server before deleting state files (Windows).** On Windows, `Remove-Item` on a SQLite file held open by the server process does not actually delete the file until the handle is closed. If you delete `nullifiers.db` while the server is running, the new server process opens the same file and finds the old nullifiers. An agent re-sending the same message IDs with different payloads then triggers violations (same nullifier, different x). Always: `kill server → delete files → restart server`. Found during Phase 4 demo testing.
- The demo-mcp server and agent load `../../.env` but **shell env wins** (`process.loadEnvFile` does not override). That is how the anvil rehearsal used public dev keys without touching `.env`.
- pnpm 11 enforces a minimum release age. A too-new package version makes it add a `minimumReleaseAgeExclude` entry to `pnpm-workspace.yaml`. Don't keep that: pin an older version instead (hono is pinned to 4.13.12 for this reason).
- `node:sqlite` needs Node ≥ 22.13 (prints an ExperimentalWarning).
- `expectRevert` in forge is consumed by the next external call. `PoseidonT2/T3.hash` are external library calls, so build Merkle proofs **before** `vm.expectRevert`.
- **Dynamic's Node SDK does not run on Windows** (`Neon: unsupported system: win32`). Use Linux, macOS or WSL (an Ubuntu distro with Node 22 worked).
- Port 3000 may be taken by the web dev server; the passkey tool uses 3777 and the registry allows both origins.
- Shell heredocs containing Solidity quotes broke Git Bash twice, and a failed multi-command line silently skipped later commands. Write files with an editor tool, and check results.
- `cast send` cannot take a tuple containing a JSON string; submit passkey assertions with viem.
- Monad testnet `eth_getLogs` is capped at 100 blocks. Event sync of v1 took 234 s for 272,700 blocks; use v2's `leaves()` (`fetchTree`) instead.
- snarkjs keeps bn128 worker threads alive; scripts/tests call `globalThis.curve_bn128.terminate()` at the end or Node never exits.
- pnpm 11 blocks install scripts; `pnpm-workspace.yaml` has `allowBuilds: esbuild: true` (needed by tsx).
- Privy test: `personal_sign` was deterministic (3/3 same wallet and message). The wallet used had no owner or policy; the owner + policy + additional-signer path is Phase 5 and untested.

## 7. Setup on a new machine
1. Node ≥ 20, pnpm ≥ 9, Foundry (`foundryup`; 1.8.4 used). Git with submodules: `git clone --recurse-submodules` (or `git submodule update --init --recursive`).
2. `cd contracts && forge test` — expect 84 passed.
3. `pnpm install && pnpm typecheck && pnpm test` — expect core 12, client 3, server 9, slasher 3, wallets 3, scout 4 passed (~40 s, real proofs). `forge test`: 89. `pnpm phase2` re-runs the Phase 2 check against v1 (~4 min, event scan).
4. Copy `.env.example` to `.env` (gitignored). **Do not ask for or reuse the previous owner's keys.** Generate your own throwaway deployer and slasher keys, fund them at `https://faucet.monad.xyz`, and add sponsor keys only for accounts you own. Required env names are in `docs/02-requirements-env.md` §5 (now includes `SLASHER_PRIVATE_KEY`).
5. Public testnet RPC: `https://testnet-rpc.monad.xyz`, chain id 10143.
6. `pnpm phase3` (= `pnpm --filter @quota/devtools phase3`) re-runs the slash e2e. It spends about 0.15 MON operator gas (mostly swept back), 0.03 stake, and ~0.28 MON slasher gas. The slasher needs ≥ 0.3 MON.

## 8. Phase 3 — done (slash, commit–reveal)
Exit checks, all PASS (full output in `docs/progress.md`; txs in `docs/deployments.md`):
- **On-chain slash on Monad testnet (registry v2):** enroll → 3 RLN proofs verified against the **on-chain** root → 4th reuses a message id → server recovers `a0` → slasher commit (block 68177684) → reveal (block 68177704) → receiver +0.015 MON (50% of 0.03) → member `Slashed`, leaf removed in the reveal → a second violation is not slashed twice.
- **Searcher (copy-and-steal), forge `test/Slash.t.sol`:** the naive one-step slash is stolen by a front-runner. On commit–reveal, the copied reveal, a same-block commit+reveal, and a later reveal all fail, and an exact copy still pays our receiver.
- `forge test` 84 passed; coverage `QuotaRegistry` 98.83% lines / 80.56% branches, `PasskeyAuth` 100% lines. `pnpm test` 17 passed; typecheck clean.

## 8b. Phase 3 — independent re-verification (2026-10-05)
A separate session re-ran all locally runnable Phase 3 checks from scratch (no code changes). Full report: `docs/phase3-test-report.md`.
- `forge test`: **84 passed, 0 failed** ✅
- `forge coverage` (standard, not `--ir-minimum`): `PasskeyAuth` 100.00% lines, `QuotaRegistry` 98.83% lines / 80.56% branches ✅
- `pnpm test`: **17 passed, 0 failed** (core 9, server 5, slasher 3) ✅
- `pnpm typecheck`: **clean** across all 4 packages ✅
- Testnet e2e not re-run: slasher wallet at ~0.016 MON (needs ≥ 0.3 MON). Original PASS evidence stands.
- Testnet e2e re-run 2026-10-05: **14/14 PASS**. Agent enrolled at index 3, commit block 68347545, reveal block 68347567, receiver +0.015 MON. Txs in `deployments.md`. Slasher well-funded (9.734 MON).
- **`forge coverage --ir-minimum` artefact:** `test_commit_firstBlockKept` fails only under IR instrumentation (`assertion failed: 1 != 6`) — the Yul IR rewriter changes `block.number` tracking. Passes under `forge test` and standard coverage. Not a functional defect.

**Must fix before the demo (economics):**
- The slasher pays ~0.284 MON gas per slash (commit 59,687 + reveal 2,725,641 limit at ~102 gwei).
- At unit 0.01 MON and a 50% share, the slash only pays off when the stake is above ~0.57 MON.
- Options:
  - Raise the demo's minimum stake / `UNIT`.
  - Cut reveal gas. It hashes the Merkle path 3×: our `_verify`, then zk-kit `_update` verifies again and rewrites. Use one verify-and-rewrite pass.
- Decide at the Phase 7 redeploy (needed anyway for the public domain).

### Phase 3 session report (2026-10-04)
- **Deviations:**
  - `commitSlash` hashes `(a0, receiver, salt)`; the PRD's `limit` argument is dropped because the registry knows it.
  - `SubmitPath` exposes `slash(req)` instead of `send(tx)`.
  - Burn share added.
  - On-chain `leaves()` added.
  - The e2e uses a **software P-256 authenticator** (labelled test tooling). The hardware passkey path was proven in Phase 1 on v1 and has not been re-run on v2.
  - New env var `SLASHER_PRIVATE_KEY`.
- **Money:**
  - The v2 deploy cost ~0.84 MON.
  - A failed run stranded ~0.43 MON.
  - Balances after: deployer 0.586, slasher 0.016. Top up from the faucet before the next redeploy (~0.84) or slash (~0.28).
- **Commits:** local only, not pushed (push needs owner approval).

## 8c. Phase 4 — done (SDKs, middleware, demo MCP server, 2026-10-05)
**How requests are bound:**
- HTTP: `x = hashToField(keccak256("QUOTA/http/v1\nMETHOD\npath?query\nbody"))`; JSON bodies are canonicalised (sorted keys).
- MCP: `"QUOTA/mcp-tool/v1\ntool\ncanonical(args)"`, with the proof in `params._meta["quota/proof"]`.
- Rejections: 401 for a missing, invalid, unknown-root, wrong-payload or stale proof; 409 for a replay; 429 for a violation. MCP returns a tool error with the same reason.

**Evidence** (details in `progress.md`; agent enrollment txs in `deployments.md`):
- `pnpm test` 26 passed, using real proofs through real Express 5, Hono and MCP SDK 1.32. `forge test` 84. Typecheck clean.
- Anvil rehearsal of the whole loop, including `--cheat` → violation → on-chain commit–reveal slash from the server.
- Monad v2 with the demo agent (index 2, limit 5): 5 accepted calls with live Wikipedia results across two agent runs (the count persisted), then `STOP` at the 6th. Slashing was off because the slasher can't pay gas.
- Clean-checkout quickstart: 401 → 200 in 28 s of machine time (agent run). A human run on Windows took 2m 27s (§8d, `phase4-test-report.md`).

**Remaining for Phase 4's intent:**
- Find a named external integrator (owner).
- Packages are TS source used from the monorepo. Publishing to npm is **not done and needs owner approval** (it's outward-facing).

## 8d. Phase 4 — re-verification (2026-10-05)
**All tests pass. One Windows bug found and fixed.**

- `pnpm typecheck`: **clean** (6 packages/apps) ✅
- `forge test`: **84/84 passed** ✅
- `forge coverage`: `PasskeyAuth` 100.00% lines / 92.31% branches; `QuotaRegistry` 98.83% lines / 80.56% branches ✅
- `pnpm test`: **26/26 passed** (core 12, client 2, slasher 3, server 9) ✅
- `pnpm phase3` (Monad testnet): **14/14 PASS** ✅ — commit block 68347545, reveal block 68347567 (+22), receiver `0x05c2bF6F50D3C177C5AAB0Ade971C82F691411C8` +0.015 MON. Txs in `deployments.md`.

**Bug fixed:** `import.meta.url` `.pathname` on Windows returns `/D:/...` (leading slash), producing double-drive paths (`D:\D:\METRO\.env`) with Node's file APIs. Fixed using `fileURLToPath(new URL(..., import.meta.url))` in:
- `packages/devtools/scripts/phase3-e2e.ts`
- `packages/devtools/scripts/enroll-agent.ts`
- `apps/demo-mcp/src/server.ts` (`.env` load + SQLite DB path)
- `apps/demo-mcp/src/agent.ts` (`.env` load + usage file path)

Only triggered on Windows with tsx. Typecheck clean after fix.

**Post-test balances:** deployer 5.159 MON, slasher 9.734 MON, agent wallet 0 MON.

## 8e. Phase 4 — live MCP demo test (2026-10-05)

**Full end-to-end demo MCP server test. All Phase 4 features verified live.**

### Honest run (5 × OK)
```
agent idCommitment 7351518591..., limit 5/epoch, remaining now 5
OK  "query 1" (proof 2334 ms) -> Wikipedia results
OK  "query 2" (proof 375 ms)
OK  "query 3" (proof 361 ms)
OK  "query 4" (proof 360 ms)
OK  "query 5" (proof 367 ms)
REJECTED "cheat 6" (proof 355 ms) -> quota: request rejected (violation, HTTP-equivalent 429)
```

### Server log (QUOTA_SLASH=1)
```
[violation] message-id reuse; idCommitment 7351518591... (secret recovered, not logged)
[slash] ...: commit 0x2e1dd2bb65d6975ae... reveal 0x17c8d78c8d4b02906a...
```

### On-chain verification
- Agent (index 4, idCommitment `7351518591...`): state=4 (Slashed) ✅
- commit tx: `0x2e1dd2bb65d6975ae083b2bb9d2f59037227230cdccf1b7a6c6154304ade6cd9`
- reveal tx: `0x17c8d78c8d4b02906a6e42e18aac96904c3b5a2ef6ecf1efab6c33ee21d54ca0`

### REST twin (no proof → 401)
```
GET /api/search?q=test  ->  HTTP 401
```

### Client-side STOP (quota exhausted)
```
STOP  "overflow query": quota exhausted for this epoch (client refuses to reuse a message id)
```

### Bug found: Windows SQLite file-handle reset
`Remove-Item nullifiers.db` while server held the file open did not delete it on Windows. New server session found old nullifiers; agent re-sent same message IDs with different payloads → violation. Correct procedure: **stop server first, then delete state files**. Added to §6 gotchas.

### Fresh demo agent enrolled for Phase 5
- `AGENT_PRIVATE_KEY=0x4931...` → idCommitment `15477875465663548400315948804121926270608349604082804923542483643861837262875`
- **Index 5, limit 5, stake 0.05 MON** (Active, not slashed)
- Enroll tx: `0x74261dd7023b62501f87a3e3f241943e0aca5a11f1f310a5cf5f1e3fe1545438`

**Post-test balances:** deployer 4.933 MON, slasher 9.228 MON.

## 8f. Phase 5 — done (wallet integrations, 2026-10-05)
**Agent side (Privy):**
- Wallet `0x1Ec0d0992990008Bcf1555FFd809Ca78aE651aA6` (`PRIVY_AGENT_WALLET_ID`) is owned by the operator's Privy user.
- Our key quorum is an additional signer under an override policy. That policy allows only registry transactions on chain 10143 with value ≤ 0.1 MON, and personal_sign of `QUOTA/rln-secret/v1…`.
- The Privy wallet is the operator: it registers the (software) passkey and enrolls. The agent's secret is `deriveSecret(privy.signMessage, n)`.

**Service side (Dynamic):**
- Server wallet `0x7d150c30971cb7aE8Bf5e9Ce6deb79a12D92Aee1`. Its share is backed up to Dynamic; we keep only the metadata and the password.
- It signs commit and reveal, and receives the reward.
- Delegated access was **not** done.

**Evidence** (txs in `deployments.md`):
- `phase5-e2e` passes on Monad: Privy enroll → proofs → cheat → Dynamic slash, with the reward received.
- The demo MCP server with `QUOTA_SLASH=1` slashed a cheating Privy agent (identity 1, index 8) on-chain via Dynamic.
- Live Privy policy check: 10/10.
- 30 package tests, forge 84.

**Exit-check caveat:**
- The demo flow uses no local agent or slasher keys.
- `.env` still holds `DEPLOYER_PRIVATE_KEY` (deploying and funding test wallets), the test-only `DEMO_OPERATOR_PASSKEY`, and the now-unused fallbacks `AGENT_PRIVATE_KEY` / `SLASHER_PRIVATE_KEY`.

**Demo usage:**
```bash
QUOTA_SLASH=1 QUOTA_MAX_FEE_GWEI=120 pnpm --filter @quota/demo-mcp start      # Dynamic slasher
pnpm --filter @quota/wallets exec tsx scripts/enroll-privy-agent.ts --identity 2 --limit 3
pnpm --filter @quota/demo-mcp agent --identity 2 "q1" "q2" "q3"          # Privy agent; then add --cheat
```
Identities already used: 0 (index 7, Active, limit 5) and 1 (index 8, Slashed). Use 2 or higher for new runs.

## 8g. Phase 7 — partial (2026-10-06)
- **Registry v3:**
  - One-pass slash removal: reveal −29% gas.
  - Unit 0.1 MON, so a limit-5 stake of 0.5 gives a 0.25 reward against ~0.2 gas. Live run: slasher net **+0.045 MON**.
  - Public rpId/origin; verified on Sourcify.
- **Privy policy** repointed to v3 with a 1 MON cap; live check 11/11.
- **Scout (`apps/scout`):**
  - `pnpm --filter @quota/scout start "goal" --identity n` (model: `QWEN_*`).
  - `--scripted [--topup]` is test tooling with no model.
  - Live on Monad with the scripted plan, all four tools worked, including an on-chain `topup_stake` (limit 3 → 4) and proofs under the new leaf.
- **Two QUOTA servers:** `QUOTA_TOOLSET=search` on :8787 (`demo-search.quota`) and `summary` on :8788 (`demo-summary.quota`).
- `README.md`, `docs/qwen-article-draft.md`.

### Session report (2026-10-06)
- **Phase 7 exit check NOT met.** It needs a judge to go from the README to login, enrol, watch Scout and see a slash. Missing: Scout has not run with a model (the Qwen key is pending), and there are no consoles (`apps/web`). The README path works from the CLI with funded keys.
- **Phase 6 cut (owner decision)** after a live re-check:
  - Nansen free tier: 10 credits/day (`related-wallets` 1 credit, `counterparties` 5).
  - Nansen's `monad` chain is mainnet, so every testnet operator returns empty data and screens "clean". The refusal case could only have been staged.
  - Evidence: `gates.md` G5. The Nansen bounty is not claimed.
- **Owner decisions:** Scout uses Qwen through sponsor credits; public passkey domain `quota-metro.vercel.app`.
- **Evidence:** 34 package tests (core 12, client 3, server 9, slasher 3, wallets 3, scout 4), `forge test` 89, typecheck clean; v3 e2e and the scripted Scout run on Monad (txs in `deployments.md`).
- **Problems hit:**
  - **Two v3 enrolls reverted on-chain**, each charged its full 2.28M gas limit (~0.2 MON each). The operator was underfunded (0.70 held vs 0.5 value + 0.27 max gas). Monad includes such a transaction and it reverts at execution. Fixed: budget stake + 0.45 MON.
  - While investigating, I added a wait in `Broadcaster` for Monad's 10 MON reserve-balance window before value transfers.
  - **`.env` was replaced** with the teammate's file and lost the Phase 5 lines. The Privy ids were restored from `deployments.md`. A new Dynamic slasher `0xe550…2b15` was created. The old Dynamic wallet `0x7d15…Aee1` (0.129 MON) is unrecoverable (password lost).
  - The owner pasted an older `.env` into chat, which **exposed live credentials**; they must be rotated (§10). It is not stored in any file.
- **Funding:** 5 MON moved from the old local-key slasher `0xb7B8…237f` (ours) to the deployer.
- **Commits:** local only. Six commits ahead of `origin/main` at the end of this session (Phase 5 + Phase 7); nothing pushed.

## 9. What to do next (rest of Phase 7, then Phase 8)
1. **Qwen run** (when `QWEN_BASE_URL/QWEN_API_KEY/QWEN_MODEL` are set):
   - Run Scout on a real research goal with both servers.
   - Save transcripts (`apps/scout/data/`) and fill the PENDING sections of the article from them.
   - Check that the model reads `quota_status`, spreads calls and never asks to exceed quota.
   - Run one `--misbehave` session against the slashing server.
2. **Consoles (needs the owner / `apps/web` contributor):**
   - Operator console: Privy login, enroll with a *real* passkey on `quota-metro.vercel.app` (the rpId is now the public domain), stake / top-up / unstake.
   - Service console: register server, live request/violation feed, slash history.
   - It currently shows mock data; don't present it as live.
3. **Phase 8:**
   - Security pass: secrets scan of the repo **and history**; credentials pasted in chat on 2026-10-06 should be rotated.
   - Threat model + "why not roll your own".
   - Demo video (≤ 3 min) and pitch video (≤ 2 min).
   - Per-bounty descriptions (Privy, Dynamic, Qwen).
   - Submit by 13 Oct evening.
4. **Optional:** move `requestUnstake`/`changeLimit` to the one-pass update too (gas). That needs a redeploy, so only do it if the consoles need it.

## 10. Open items needing the owner
- **Qwen key** (sponsor credits) → `QWEN_BASE_URL`, `QWEN_API_KEY`, `QWEN_MODEL` in `.env`.
- **Rotate the credentials pasted into chat on 2026-10-06:** Privy app secret + authorization key, Dynamic API token, Nansen key, Cleanverse keys. After rotating, update `.env`, and re-run `privy-policy-check` if the Privy key quorum changes.
- **Back up `.env`**; it holds the Dynamic wallet password.
- Consoles: OK to work in `apps/web`, or will the contributor build them on v3?
- A named external integrator (Phase 4 item, deferred by owner).
- Approval before publishing packages to npm (if wanted).
- Balances (2026-10-06): deployer 5.14 MON, Privy agent 0.34, Dynamic slasher 0.41, old local-key slasher 4.23 (funding reserve).
- Read access for the organizers' account.
- Community group (or skip).
- **Push approval:** local `main` is ahead of `origin/main` (Phase 5 wallets, the Phase 6 cut, Phase 7 v3/Scout/README). Nothing is pushed.
- The Vercel deployment `https://quota-metro.vercel.app` shows mock data; do not present it as live results.

## 11. Working-tree note
`apps/web` belongs to another contributor (their edits are committed in `0ddd942`). Ask before touching it.
