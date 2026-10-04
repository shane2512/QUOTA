# QUOTA — Handoff for the next engineer / agent

You are continuing a hackathon build (Monad Metropolis, Track 4). Deadline **14 Oct 2026, 09:29 IST**; submit by the evening of 13 Oct. Repo: `github.com/shane2512/QUOTA`. Phases 0–3 are done. **Start at Phase 4** (§9). Read §8 first: the slash works on-chain but is not yet economical at demo stake sizes.

## 1. What QUOTA is (one paragraph)
Anonymous, staked, slashable rate limits for AI-agent traffic on Monad. An operator locks a stake (approved by a human passkey, verified on-chain via the P256 precompile at `0x100`); the agent joins a Merkle tree. Each request carries an RLN-v2 zero-knowledge proof of "I am a member and this is request k of my N this epoch". Reusing a request number leaks the agent's secret `a0` (Shamir two-point recovery); anyone with `a0` can slash the stake. No issuer. The primary output is a primitive (contracts, SDKs, middleware), not a consumer app.

## 2. Read first, in this order
1. `docs/concept.md` — idea in plain words
2. `docs/01-PRD.md` — requirement IDs (C1–C8, Z1–Z4, S1–S5, B1–B3, W1–W4, T1–T3, D1–D5). Cite IDs in commits.
3. `docs/03-phases.md` — phases with exit checks. Follow the order.
4. `docs/gates.md` — **what is actually verified vs not.** Read before trusting any sponsor claim.
5. `docs/progress.md` — chronological log, decisions, open items
6. `docs/deployments.md` — addresses and tx evidence
7. `docs/MASTER_PROMPT.md` — the working rules (summarised below). If a doc and the prompt disagree, stop and ask the owner.

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
| 3 Slash (commit–reveal) | Done. On-chain slash with reward on Monad testnet; searcher test in forge |
| 4 SDKs, middleware, demo MCP | **Next** |
| 5–8 | Not started |

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
packages/client/                   @quota/client: QuotaClient.signRequest/prove, message-id tracking, allowOveruse
packages/server/                   @quota/server: QuotaVerifier, MemoryNullifierStore, RegistryRootChecker, onViolation
packages/slasher/                  @quota/slasher: WalletAdapter, LocalKeyWallet, Broadcaster, CommitRevealPath, Slasher
packages/server/scripts/phase2-exit.ts   Phase 2 exit check (`pnpm phase2`, runs against v1)
packages/slasher/scripts/phase3-e2e.ts   Phase 3 exit check (`pnpm --filter @quota/slasher phase3`, uses .env)
packages/slasher/scripts/soft-passkey.ts TEST TOOLING: software P-256 authenticator for unattended scripts
apps/web/                          Next.js landing + consoles from another contributor; "demo data", not reviewed
docs/                              PRD, phases, gates, deployments, progress
```
Deployed on Monad testnet (chain 10143):
- **Registry v2 (current):** `0xd89BFd2f093015193d42EA51170D64d9242a40C6`, rpId `localhost`, verified on Sourcify. Leaf 0 is an orphan from a failed run (secret unknown, harmless). Leaf 1 was enrolled and then slashed by the Phase 3 e2e.
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
- `treeId` must be 0 until Phase 6. `limit` must be 1..65535 (`MAX_LIMIT`, circuit range).

## 5b. RLN facts (Phase 2)
- Artifacts: PSE p0tion ceremony `rln-20` (rlnjs 3.x defaults), circuit `circom-rln` `RLN(20, 16)`. Public signals in order: `[y, root, nullifier, x, externalNullifier]`. `y = a0 + a1·x`, `a1 = Poseidon(a0, externalNullifier, messageId)`, `nullifier = Poseidon(a1)`.
- `x = hashToField(payloadHash)`; `hashToField` = keccak256 >> 8. External nullifier = `Poseidon(hashToField(serverId), epoch)`, epoch = `floor(unix / epochLength)` (default 3600 s). The verifier accepts the current epoch and one previous one (`epochGrace`).
- Wire format: header `x-quota-proof` = base64url JSON `{proof, signals, epoch}` (`encodeProof`/`decodeProof` in core).
- Verifier order: epoch → external nullifier → payload binding → `isKnownRoot` (RPC, 5 s cache) → Groth16 → nullifier store. Same nullifier + same x = `replay`; same nullifier + different x = `violation` → `onViolation({secret, idCommitment, …})`. Never log `secret`.
- Measured on an Apple M2 (node 26): proving median 1170 ms in one run and 705 ms in another (n=10 each); verify median 16–32 ms. Windows and browser not measured.

## 6. Gotchas that already cost time
- **Foundry only exposes the P256 precompile under `evm_version = "osaka"`** (set in `contracts/foundry.toml`). Under `prague` the call returns empty and valid signatures fail. `PasskeyAuth` fails closed when the precompile is missing.
- **Monad bills the gas limit**, not gas used. Receipts show your limit as `gasUsed`. Use `eth_estimateGas` (the `Broadcaster` sends estimate × 1.15). Monad rejected a 10 gwei max fee; gas price is ~102 gwei, so scripts use a max-fee floor of 200 gwei. The sender's balance must cover limit × max fee + value, even though only limit × effective price is charged.
- **Monad executes asynchronously; this cost two failed runs and ~0.43 MON:**
  - An `eth_call` pinned to the newest block number can return state from before that block's transactions. `fetchTree` reads at latest and retries until the root matches `root()`.
  - A freshly funded account's first transaction is rejected ("Signer had insufficient balance") because consensus checks lagging state. Wait ~4 blocks after funding.
- **Never keep a funded throwaway key only in memory.** The e2e sweeps the operator's balance back in a `finally`.
- **anvil:** run with `--hardfork osaka --block-time 1`. Osaka is needed for P256. Without block time, anvil only mines on transactions, so the commit→reveal wait never ends.
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
3. `pnpm install && pnpm typecheck && pnpm test` — expect core 9, server 5, slasher 3 passed (~30 s, real proofs). `pnpm phase2` re-runs the Phase 2 check against v1 (~4 min, event scan).
4. Copy `.env.example` to `.env` (gitignored). **Do not ask for or reuse the previous owner's keys.** Generate your own throwaway deployer and slasher keys, fund them at `https://faucet.monad.xyz`, and add sponsor keys only for accounts you own. Required env names are in `docs/02-requirements-env.md` §5 (now includes `SLASHER_PRIVATE_KEY`).
5. Public testnet RPC: `https://testnet-rpc.monad.xyz`, chain id 10143.
6. `pnpm --filter @quota/slasher phase3` re-runs the slash e2e. It spends about 0.15 MON operator gas (mostly swept back), 0.03 stake, and ~0.28 MON slasher gas. The slasher needs ≥ 0.3 MON.

## 8. Phase 3 — done (slash, commit–reveal)
Exit checks, all PASS (full output in `docs/progress.md`; txs in `docs/deployments.md`):
- **On-chain slash on Monad testnet (registry v2):** enroll → 3 RLN proofs verified against the **on-chain** root → 4th reuses a message id → server recovers `a0` → slasher commit (block 68177684) → reveal (block 68177704) → receiver +0.015 MON (50% of 0.03) → member `Slashed`, leaf removed in the reveal → a second violation is not slashed twice.
- **Searcher (copy-and-steal), forge `test/Slash.t.sol`:** the naive one-step slash is stolen by a front-runner. On commit–reveal, the copied reveal, a same-block commit+reveal, and a later reveal all fail, and an exact copy still pays our receiver.
- `forge test` 84 passed; coverage `QuotaRegistry` 98.25% lines / 80.56% branches, `PasskeyAuth` 100% lines. `pnpm test` 17 passed; typecheck clean.

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

## 9. Phase 4 — what to do next (SDKs, middleware, demo MCP server)
Exit check: a stranger (or a clean machine) follows the service quickstart in ≤ 10 minutes.
1. `@quota/server` middleware (PRD S2): Express and Hono adapters around `QuotaVerifier.verifyHeader`.
   - `payloadHash` = keccak256 of a canonical request (method, path, body), computed identically by the client.
   - Return 429 on `QuotaExhausted`-style failures, 401 on invalid proofs, 409 on replay.
   - Wire `onViolation` to `Slasher.enqueue`.
2. An MCP server wrapper: the proof travels in request metadata or a transport header. Check what the MCP SDK allows before designing.
3. `apps/demo-mcp`: a reference MCP server (e.g. a web-search stub with real data) behind QUOTA, using registry v2 from `.env`.
4. Client side: a `fetch` wrapper that adds `x-quota-proof`. Keep a tree cache refreshed with `fetchTree` when `isKnownRoot` fails.
5. Persistent nullifier store (SQLite or Redis) behind the `NullifierStore` interface; the memory store loses state on restart.
6. Quickstarts for both personas; time a fresh developer.
7. **Flag:** the named external integrator is due by Phase 4 (owner).

## 10. Open items needing the owner
- Qwen decision.
- Nansen credits.
- **A named external integrator (due now, Phase 4).**
- Final public domain (needed for the Phase 7 redeploy).
- Faucet top-up for the deployer and slasher.
- Read access for the organizers' account.
- Community group (or skip).
- Push approval for the local commits.
- The Vercel deployment `https://quota-metro.vercel.app` shows mock data; do not present it as live results.

## 11. Working-tree note
`apps/web` belongs to another contributor (their edits are committed in `0ddd942`). Ask before touching it.
