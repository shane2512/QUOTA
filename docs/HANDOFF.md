# QUOTA — Handoff for the next engineer / agent

You are continuing a hackathon build (Monad Metropolis, Track 4). Deadline **14 Oct 2026, 09:29 IST**; submit by the evening of 13 Oct. Repo: `github.com/shane2512/QUOTA`. Phases 0 and 1 are done. **Start at Phase 2.**

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
| 1 Contracts | Done. Open: explorer verification, real Monad gas figure |
| 2 RLN proofs | **Next** |
| 3–8 | Not started |

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
contracts/src/QuotaRegistry.sol    tree, passkey registry, enroll/topUp/changeLimit/requestUnstake/unstake
contracts/test/*.t.sol             64 tests, all green
contracts/script/Deploy.s.sol      deploy script (env-driven)
contracts/tools/passkey-demo/      local page + server to create a real passkey and sign assertions
apps/web/                          Next.js landing + consoles from another contributor; "demo data", not reviewed
docs/                              PRD, phases, gates, deployments, progress
```
Deployed on Monad testnet (chain 10143): registry `0x05a5fe209E19C6707e2E701A76A0C94b2351E0ac` (rpId `localhost`). A real Windows Hello passkey was registered and one agent enrolled (txs in `docs/deployments.md`).

## 5. Contract facts you need
- **Leaf** = `Poseidon([idCommitment, limit])`, `idCommitment = Poseidon(a0)`. The contract computes the leaf itself (the PRD's C4 said the caller passes `rateCommitment`; we changed it so a caller cannot claim a bigger limit than the stake pays for).
- Tree: zk-kit `InternalBinaryIMT`, fixed depth (constructor arg; deploy default 20), **zero leaf = 0**, `PoseidonT3` from `poseidon-solidity`. Removal/update need Merkle siblings + path against the **current** root, so a slasher can race enrollments. Events `LeafSet(index, leaf)` (leaf 0 = removed) let you rebuild the tree off-chain in order.
- **Passkey challenge** = `keccak256(abi.encode(chainId, registry, operator, uint8 action, keccak256(params), nonce))`. Actions: `0 RegisterPasskey, 1 Enroll, 2 RequestUnstake, 3 ChangeLimit`. Params are `abi.encode` of: register `(x,y)`; enroll `(id, limit, treeId, msg.value)`; unstake `(id, destination)`; changeLimit `(id, newLimit)`. Operator = `msg.sender`. The nonce increments on every successful action.
- Member records (`members(id)`) are keyed by `idCommitment` and kept after unstake. Phase 3's `slash(a0, limit, receiver)` should use them (payout from `stake`, remove leaf with caller-supplied siblings, mark a new `Slashed` state so the id can never re-enroll). Unstake delay must exceed epoch + root TTL so a cheater cannot dodge a slash.
- Roots stay valid for `ROOT_TTL` after being superseded (`isKnownRoot`).
- `rpId` and allowed origins are **immutable**. The registry must be redeployed when the final public domain is chosen (Phase 7). A passkey made for `localhost` does not work on another domain.
- `treeId` must be 0 until Phase 6.

## 6. Gotchas that already cost time
- **Foundry only exposes the P256 precompile under `evm_version = "osaka"`** (set in `contracts/foundry.toml`). Under `prague` the call returns empty and valid signatures fail. `PasskeyAuth` fails closed when the precompile is missing.
- **Monad bills the gas limit**, not gas used. Receipts show your limit as `gasUsed`. To measure real consumption use `eth_estimateGas` before sending. Monad also rejected a 10 gwei max fee; gas price is ~102 gwei, use ≥ 200 gwei max fee in scripts.
- **Dynamic's Node SDK does not run on Windows** (`Neon: unsupported system: win32`). Use Linux, macOS or WSL (an Ubuntu distro with Node 22 worked).
- Port 3000 may be taken by the web dev server; the passkey tool uses 3777 and the registry allows both origins.
- Shell heredocs containing Solidity quotes broke Git Bash twice, and a failed multi-command line silently skipped later commands. Write files with an editor tool, and check results.
- `cast send` cannot take a tuple containing a JSON string; submit passkey assertions with viem.
- Privy test: `personal_sign` was deterministic (3/3 same wallet and message). The wallet used had no owner or policy; the owner + policy + additional-signer path is Phase 5 and untested.

## 7. Setup on a new machine
1. Node ≥ 20, pnpm ≥ 9, Foundry (`forge`, `cast`). Git with submodules: `git clone --recurse-submodules` (or `git submodule update --init --recursive`).
2. `cd contracts && forge test` — expect 64 passed.
3. Copy `.env.example` to `.env` (gitignored). **Do not ask for or reuse the previous owner's keys.** Generate your own throwaway deployer with `cast wallet new`, fund it at `https://faucet.monad.xyz`, and put sponsor keys in only if you own those accounts. Required env names are listed in `docs/02-requirements-env.md` §5.
4. Public testnet RPC: `https://testnet-rpc.monad.xyz`, chain id 10143.

## 8. Phase 2 — what to do next (RLN proofs)
Exit check: a script where 3 honest requests verify; a second use of the same message id recovers `a0` exactly; per-server external nullifier prevents cross-server collisions; recent-roots sync from the registry; proof gen/verify times **measured and recorded**.

Plan:
1. Vendor the PSE RLN-v2 circuit artifacts (wasm, zkey, verification key) from `github.com/privacy-ethereum/rln` / `rlnjs`. Pin versions and SHA-256 checksums in the repo. Reuse their ceremony output; do not run your own setup and do not write a custom circuit.
2. **First verify compatibility** before building anything else: the circuit's identity commitment, rate commitment and Merkle hashing must equal what the contract computes (`Poseidon([Poseidon([a0]), limit])`, zero leaf 0, fixed depth, circomlib-compatible Poseidon). Write a test that builds a tree off-chain with circomlibjs/poseidon-lite, compares its root to a root read from the registry, and verifies a proof against that root. If tree depth in the artifacts differs from the registry's, change the registry depth before the next deployment.
3. `@quota/client`: `signRequest(serverId, payloadHash)` with epoch and message-id tracking; refuse to exceed the local limit unless `allowOveruse` (used for the violation demo).
4. `@quota/server`: proof verifier, nullifier store `(externalNullifier, nullifier) → (x, y)`, secret recovery from two shares, recent-roots sync (use `isKnownRoot`), `onViolation`.
5. External nullifier = `H(serverId, epoch)` so shares from different servers never collide.
6. Create `packages/*` only as needed (layout in `docs/02-requirements-env.md` §6). Record benchmark numbers in `docs/progress.md`.

## 9. Phase 3 preview (slash, commit–reveal)
`commitSlash(H(a0, limit, receiver, salt))` then `revealSlash(...)` after at least one block. Add a **searcher test**: a bot watching the public path must fail to steal the reward on commit–reveal, and succeed on a naive one-step `slash` (to prove the race is real). Slasher service: violation → queue → commit → reveal. The reveal still exposes `a0` publicly; after commit the reward is locked to the committer, which is the protection.

## 10. Open items needing the owner
Qwen decision; Nansen credits; a named external integrator (needed by Phase 4); final public domain; read access for the organizers' account; community group (or skip). The Vercel deployment `https://quota-web-zeta.vercel.app` shows mock data; do not present it as live results.

## 11. Working-tree note
`apps/web` had uncommitted edits (`globals.css`, `World.tsx`, `scene3d.ts`) belonging to another contributor. Ask before touching them.
