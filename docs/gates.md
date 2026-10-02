# QUOTA — Phase 0 Gates

Status: **PASS** (observed) · **FAIL** · **PENDING** (needs a human input; not yet tested) · **PARTIAL** (docs read, live call not made).
Nothing here is marked PASS from memory. Last updated: 2026-10-02.

## G0 — Monad testnet + toolchain

| Item | Result | Evidence |
|---|---|---|
| Chain ID | **PASS** `10143` | `cast chain-id --rpc-url https://testnet-rpc.monad.xyz` → `10143` |
| RPC | **PASS** | same RPC: `cast block-number` → `67510859` (live). Docs list also `https://rpc.ankr.com/monad_testnet`, `https://rpc-testnet.monadinfra.com` |
| Explorer | PASS (docs) | `https://testnet.monadvision.com`, `https://testnet.monadscan.com` — https://docs.monad.xyz/developer-essentials/testnets |
| Faucet | PARTIAL | `https://faucet.monad.xyz` (docs). Funding is a human step. |
| P256VERIFY `0x100` on testnet | **PASS** | `cast call 0x…0100 <RIP-7212 valid vector>` → `0x…01`. (Invalid input returns empty; only valid-vector result recorded.) |
| Testnet reset | note | Docs: testnet reset from genesis 2025-12-16. Chain version `v0.15.2 / MONAD_NINE`. |
| Local toolchain | PASS | forge/cast 1.5.1-stable, node v22.13.1, pnpm 11.25.0. `forge test` → 1 passed (Hello). circom/snarkjs not yet installed (Phase 2). |
| Hello contract deployed | **PENDING** | Deployer EOA generated (address `0x0437938E18Bd2E6d8Cad0921C8dc1e7Ff28Df7b2`, key only in gitignored `.env`). Needs test MON from the faucet. |

## G1 — BTX (encrypted mempool)

**Decision: `commitReveal` is primary. `btx` is not planned unless a mentor provides a testnet interface.** Status: **FAIL (provisional)** — no public interface found; mentor confirmation still outstanding.

Evidence:
- Searched official Monad docs index (`docs.monad.xyz/llms.txt`): no page mentions BTX, encrypted mempool or threshold encryption.
- BTX is published as a research scheme by Category Labs (paper: https://category-labs.github.io/category-research/BTX-paper.pdf). The Monad post calls it a building block for "a working encrypted mempool" (X post, could not be fetched directly: HTTP 402; text seen via search snippet only).
- Search results place the encrypted mempool as the *concluding* phase of Monad's privacy roadmap (secondary source, not official docs).
- Not established: whether a hackathon-only testnet interface exists. Only Monad mentors can say. **Human action: ask on the hackathon Discord** (see checklist).

Consequence: B3 ships as commit–reveal, labelled as the fallback. We will not call it BTX anywhere. Docs threat model says the front-runner is a leader/RPC operator (no global mempool).

## G2 — Privy

| Question | Result | Evidence |
|---|---|---|
| Does policy cover `personal_sign`? | **PASS (docs)** | Rules accept `method: personal_sign` with `message.content` operators (`eq`, `starts_with`, …) and `byte_length`. https://docs.privy.io/controls/policies/example-policies/ethereum#restrict-message-signing-by-content |
| Sign-only exists? | **PASS (docs)** | `eth_signTransaction` returns RLP signed tx, accepts arbitrary `chain_id`. https://docs.privy.io/api-reference/wallets/ethereum/eth-sign-transaction |
| Sign-only works on Monad (chain 10143)? | **PENDING** | Needs `PRIVY_APP_ID/SECRET`; sign a type-2 tx with `chain_id: 10143`, then broadcast with cast. |
| `personal_sign` deterministic for same message? | **PENDING** | Needs live call, same message twice, compare. If it differs, fall back to encrypted blob for `a0` (PRD risk table). Note: Privy docs do not state determinism. |
| Subsidized testnet | PENDING | Email `monad@privy.io` (human). |

## G3 — Dynamic

Status: **PENDING** (needs `DYNAMIC_ENVIRONMENT_ID`, `DYNAMIC_API_TOKEN`).
Docs read: delegated access sends `wallet.delegation.created/revoked` webhooks carrying `walletId`, `walletApiKey`, `keyShare`; `delegatedSignTransaction` returns a signed EVM tx (https://www.dynamic.xyz/docs/node/evm/delegated-access). Monad lists Dynamic as supported embedded-wallet provider (https://docs.monad.xyz/tooling-and-infra/wallet-infra/embedded-wallets). Not yet shown: a Monad testnet signature, a reachable webhook. Cut rule applies: no signed Monad tx by end of Phase 0 → drop.

## G4 — Cleanverse

Status: **PENDING** (blocked on invitation code; likely partial FAIL if not supplied).
Evidence: `https://docs.cleanverse.com` shows only an invitation-code input (observed). No access to the three Drive guides. Not tested: CVA on Monad testnet, on-chain CVI call, sandbox credentials. Any single failure → drop. Credentials must go to `.env` only.

## G5 — Nansen

Status: **PENDING** (needs `NANSEN_API_KEY`).
Docs seen via search: Profiler endpoints `https://api.nansen.ai/api/v1/profiler/address/{labels,related-wallets,counterparties}`, key in `apikey` header (https://docs.nansen.ai/api/overview). `docs.nansen.ai` failed TLS from this machine's fetch tool, so exact request bodies and credit costs are unverified. Pass requires one real Profiler call with data for a Monad address.

## G6 — Qwen

Status: **PARTIAL**.
- Model ID per Alibaba Cloud docs search result: `qwen3.8-max` (page: https://help.aliyun.com/en/model-studio/qwen3-8-max — direct fetch failed: ECONNREFUSED, so not read in full).
- OpenAI-compatible base URL is workspace-scoped and regional: `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` (search snippet; international/Singapore URL unconfirmed).
- Not done: one tool-calling round trip (needs `QWEN_API_KEY`, workspace ID, region).
- Note: hackathon prompt says "Qwen 3.8 Max" via qwencloud.com; confirm that console issues keys for this same model ID.

## Summary

| Gate | Status | Scope effect |
|---|---|---|
| G0 chain/toolchain | PASS except deploy (needs faucet) | none |
| G1 BTX | FAIL (provisional) | commit–reveal primary |
| G2 Privy | PARTIAL (docs PASS, live PENDING) | keep; derive `a0` fallback ready |
| G3 Dynamic | PENDING | keep until end of Phase 0, then cut rule |
| G4 Cleanverse | PENDING (blocked on code) | first cut candidate |
| G5 Nansen | PENDING | conditional |
| G6 Qwen | PARTIAL | keep |
