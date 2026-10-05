# QUOTA — Phase 0 Gates

Status: **PASS** (observed) · **FAIL** · **PARTIAL** (some parts observed) · **DEFERRED** (owner decision).
Nothing is marked PASS from memory. Last updated: 2026-10-03. Test wallets/addresses below are public testnet data; no secrets are recorded here.

## G0 — Monad testnet + toolchain: PASS

| Item | Result | Evidence |
|---|---|---|
| Chain ID / RPC | PASS | `cast chain-id --rpc-url https://testnet-rpc.monad.xyz` → `10143` |
| Explorer, faucet | PASS (docs) | `https://testnet.monadvision.com`, `https://faucet.monad.xyz` — https://docs.monad.xyz/developer-essentials/testnets |
| P256VERIFY `0x100` | PASS | `cast call 0x…0100 <RIP-7212 valid vector>` → `0x…01` |
| Hello deployed | PASS | `0x30A8e23Db6A8959913986336C749d7C8FCbFF0cf`, tx `0xf5b1578aa7d41c55671cd717ecda135bf95f3fb95ac7b7a3cd188049aaed4ae3`, block 67894111, status 1, gasUsed 227242. `greeting()` → `"QUOTA"`, `chainId()` → `10143`. Explorer source verification not yet done (Phase 1). |
| Toolchain | PASS | forge/cast 1.5.1-stable, node 22.13.1, pnpm 11.25.0 (Windows); WSL Ubuntu with node 22.13.1 for Linux-only SDKs |
| Fee floor | note | Monad rejected a tx with `maxFee` 10 gwei ("Transaction fee too low"); `cast gas-price` → 102 gwei. Use ≥ 200 gwei max fee in scripts. |

## G1 — BTX: FAIL (confirmed by organizers)

Organizers confirmed BTX is not available. Own research agreed: no BTX page in docs.monad.xyz index; BTX is a research scheme (https://category-labs.github.io/category-research/BTX-paper.pdf). **Decision: `commitReveal` is the only slash path.** B3 `btx` is dropped. Docs must state the front-runner is a leader/RPC operator (no global mempool) and that commit–reveal is not BTX.

## G2 — Privy: PASS

Test wallet: server wallet, **no owner/policy** (app-secret auth only). Owner + policy + additional-signer path is Phase 5.

| Question | Result | Evidence |
|---|---|---|
| `personal_sign` deterministic? | **PASS** | Same wallet, same message `QUOTA/rln-secret/v1`, 3 calls → 3 identical signatures. (Sample size 3; same wallet only.) |
| Policy covers `personal_sign`? | PASS (docs only) | `message.content` / `byte_length` conditions — https://docs.privy.io/controls/policies/example-policies/ethereum#restrict-message-signing-by-content. Not yet exercised live. |
| Sign-only works on Monad? | **PASS** | `eth_signTransaction` with `chain_id: 10143` → RLP; `cast decode-tx` signer = wallet `0x9682FD25c31F982FF008b827f195E47b96D6af3a`; broadcast with `cast publish`: tx `0x9bea1efd0a35002e143e7be82967f051626c95fc02ed571fb63d4c7a4e352cb7`, status 1. (An earlier attempt, `0x1489a583…`, was mined but reverted because I used a wrong function selector; the signing path itself worked.) |
| Subsidized testnet | not needed so far | |

## G3 — Dynamic: PARTIAL (keep via server-wallet fallback)

| Item | Result | Evidence |
|---|---|---|
| Auth with env ID + API token | PASS | `@dynamic-labs-wallet/node-evm` `authenticateApiToken` ok |
| Server wallet created | PASS | `0xb1E9a0311088528F6cD90316a7f3c7E86d43060a` (TWO_OF_TWO, backed up to Dynamic) |
| Sign-only Monad testnet tx | **PASS** | `signTransaction` (chainId 10143) → `cast decode-tx` signer matches; broadcast tx `0x4d187a9a3da89a24a1e8e022ce420e67256eb015fb6aed3eef3f5aad498dbefa`, block 67895388, status 1. |
| Delegated-access webhook reachable | **NOT TESTED** | Needs an end-user embedded wallet + public HTTPS URL (`DYNAMIC_WEBHOOK_PUBLIC_URL` empty). |
| Platform | **constraint** | `@dynamic-labs-wallet/node` native module: "Neon: unsupported system: win32". Must run on Linux/macOS (WSL for dev; deploy on Linux). |

Consequence: W3 uses the documented fallback (Dynamic server wallet) unless the delegated flow is proven in Phase 5. Do not claim delegated access until a webhook is received.

## G4 — Cleanverse: FAIL → DROP (cut rule)

- `https://docs.cleanverse.com` is invitation-code gated; no code supplied, three Drive guides not read.
- Public search turned up CVI/CVA addresses in a *third-party hackathon repo* (TrustFlow). On-chain check: `sourceId()` on that "CVI oracle" returns `"trustflow-mock-oracle-v1"` — it is that project's mock, **not Cleanverse's**. Not usable as evidence.
- Sandbox API base URL and request-encryption format are undocumented in public sources, so the credentials could not be tested.
- Reopen only if the user provides the invitation code before Phase 5 ends. Until then Compliant tree (C8/T3) is cut.

## G5 — Nansen: CUT (owner decision, 2026-10-06)

| Endpoint | Result | Evidence |
|---|---|---|
| `POST /api/v1/profiler/address/labels` (chain `monad`) | **PASS** | HTTP 200; ERC-8004 IdentityRegistry `0x8004A1…a432` → labels `ERC721`, `AgentIdentity`, `AGENT`, `Token Contract` |
| `related-wallets`, `counterparties` | **FAIL (credits)** | HTTP 403 `insufficient_credits` |

Consequence: the Screener's recidivism rule (T2) needs related-wallets/counterparties. Needs credits (ask Nansen sponsor channel) or Screener falls back to labels + our own funding-source trace from chain data. Nansen stays conditional; cut early if credits don't arrive.

**Re-check 2026-10-06 (live), then cut:**
- **Plan:** the key is on the **free tier: 10 credits/day, reset at midnight UTC** (response header `x-nansen-plan-notice`).
- **Costs:** `related-wallets` 1 credit, `counterparties` 5 credits (needs `date: {from, to}`); `labels` returned `insufficient_credits` once the day's budget was spent. The earlier "FAIL (credits)" was the daily budget, not a missing entitlement.
- **Data:** `related-wallets` and `counterparties` return HTTP 200 with **empty `data`** for our operator wallets. Nansen's `monad` chain is Monad **mainnet**, and every QUOTA operator is a testnet-only wallet, so every operator would screen "clean". The exit check (refuse a wallet related to a slashed one) could only be shown with a staged relation.
- **Decision (owner):** cut Nansen per the agreed cut order. No Screened tree, no Nansen bounty claim; C8 / T1 / T2 not built.

## G6 — Qwen: DEFERRED (owner decision, 2026-10-03)

Hosted `qwen3.8-max` is not free; key not set. The agent loop stays provider-agnostic (D1). Alternatives, in order of preference: (1) Qwen credits via sponsor channel, (2) a Qwen open-weight model through any OpenAI-compatible free tier, (3) drop the Qwen bounty and use any tool-calling model. If (3), D1 still ships but no Qwen article or bounty claim. Decide before Phase 7.

## Summary

| Gate | Status | Scope effect |
|---|---|---|
| G0 chain/toolchain/Hello | PASS | none |
| G1 BTX | FAIL (confirmed) | commit–reveal only; `btx` dropped |
| G2 Privy | PASS (+ owner/policy/additional-signer path PASS in Phase 5) | keep |
| G3 Dynamic | PARTIAL → server wallet PASS in Phase 5 (incl. live slash) | keep as server-wallet; delegated access still unproven |
| G4 Cleanverse | FAIL | dropped |
| G5 Nansen | PARTIAL | conditional; labels only until credits |
| G6 Qwen | DEFERRED | decide before Phase 7 |

## Phase 5 follow-up (2026-10-05)

**G2 Privy, owner + policy + additional signer: PASS (live).**
- Setup: an operator user created server-side, plus an agent wallet owned by that user, with our key quorum `cvlhfa0w46j966r07ahobnok` as an additional signer under an override policy.
- The policy allows:
  - `eth_signTransaction` only when `to` = registry, `chain_id` = 10143, and `value` ≤ 0.1 MON;
  - `personal_sign` only for messages that start with `QUOTA/rln-secret/v1`.
- `scripts/privy-policy-check.ts` result, 10/10 PASS:
  - The secret message signed 3× gave identical signatures, so it is deterministic under the policy.
  - `.../v1/1` (identity rotation) signed.
  - Rejected with `policy_violation`: another message, another contract, a value over the cap, another chain.
- Used for real on Monad: the Privy wallet registered the passkey and enrolled.

**G3 Dynamic, server wallet: PASS.**
- New wallet `0x7d150c30971cb7aE8Bf5e9Ce6deb79a12D92Aee1`, TWO_OF_TWO, with its external share backed up to Dynamic and password-encrypted. We keep only the metadata (ids and backup locations), no key share.
- It signed a commit and a reveal on Monad testnet (txs in `deployments.md`), and the slash reward landed in it.
- Caveats:
  - The Phase 0 wallet `0xb1E9…060a` cannot sign from here: its creation metadata (`externalServerKeySharesBackupInfo`) was not saved.
  - Signing is intermittently slow: one attempt timed out after 300 s (`FORWARD_MPC_TIMEOUT`, accelerator path), another after ~99 s, while other attempts took 7–10 s. The adapter disables the accelerator and retries up to 3×.
  - **Delegated access is still not tested** and must not be claimed.
