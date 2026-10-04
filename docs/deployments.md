# Deployments (Monad testnet, chain 10143)

| Contract | Address | Tx | Notes |
|---|---|---|---|
| PoseidonT3 (linked library) | `0x791112caa53a60b6353a07c7501d41e750095422` | `0x388510bc…912e` | CREATE2, block 67905047 |
| QuotaRegistry **v0 (superseded)** | `0x5BaF5568e1dc363781b74d33B89d0e9f4f0D19ad` | `0xe5930e36…2c32` | origin allowlist only `localhost:3000`; not used |
| QuotaRegistry **v2 (current, dev)** | `0xd89BFd2f093015193d42EA51170D64d9242a40C6` | `0xf198c48ebe7d289ec6653a70fdd893f2d17c46aac8a23d3987c525e259d81c0d` | block 68177360. Adds commit–reveal slash, `limit ≤ 65535`, on-chain `leaves()`. rpId `localhost`; origins `localhost:3000`, `localhost:3777`; depth 20; unit 0.01 MON; unstake delay 2 h; root TTL 10 min; slash share 5000 bps. **Source verified on Sourcify** (`match`, job `e042a576-1351-425e-b824-9ff7038fa365`). |
| PoseidonT2 (linked library, v2) | `0xC3cAE955c69c26E8b840519d6265C928582A6a3E` | `0xd225e24f3372bb0d36950122e6c7a5f394829a036418665bdb1af48b37c80399` | CREATE2, block 68177357 |
| QuotaRegistry **v1 (superseded)** | `0x05a5fe209E19C6707e2E701A76A0C94b2351E0ac` | `0x5df69d77…77c9` | Phase 1 passkey evidence below. No slash, no `leaves()`. Not verified on the explorer. |
| Hello (Phase 0) | `0x30A8e23Db6A8959913986336C749d7C8FCbFF0cf` | `0xf5b1578a…4ae3` | smoke test, source removed from repo |

`rpId` and allowed origins are immutable, so the registry must be redeployed for the final public domain (Phase 7). v2 source is verified on Sourcify; v1 is not.

## Phase 1 exit check: real passkey on-chain (registry v1)

Passkey: a Windows Hello platform credential created in Chrome at `http://localhost:3777` (tool: `contracts/tools/passkey-demo`).
Operator wallet: throwaway deployer `0x0437938E18Bd2E6d8Cad0921C8dc1e7Ff28Df7b2`.

| Step | Tx | Result |
|---|---|---|
| `registerPasskey(x, y, assertion)` | `0x680fb30a0958cdc5fe58b5aca350a81cd5f4932f16878df5aa26815f79b741a8` (block 67906695) | status 1; `passkeys(op)` returns the credential's x/y; nonce 1 |
| `enroll(id, 1, 0, assertion)` with 0.01 MON | `0xad7f17bcfdfca91dd797110fcbe7f646391b9d044e29f0b23a211b3cc17b9203` (block 67906994) | status 1; `numberOfLeaves` 1; member Active, limit 1, stake 0.01 MON; nonce 2 |

Replay protection observed live: the first enroll assertion (signed with nonce 0 before registration) was not submitted because the registry nonce had moved to 1; a fresh assertion was required.

## Phase 3 exit check: on-chain slash (registry v2, 2026-10-04)

Run with `pnpm --filter @quota/devtools phase3` (moved from `@quota/slasher` in Phase 4). The operator passkey here is a **software P-256 authenticator** (`packages/slasher/scripts/soft-passkey.ts`, test tooling), not hardware. The hardware passkey path was proven in Phase 1. The operator and receiver are fresh throwaway addresses.

| Step | Tx | Result |
|---|---|---|
| Fund operator | `0xf7ed17c18ebfbce68b36c452338797e8ad54f92e3a6fd6a728cd649357c6f33c` | status 1 |
| `registerPasskey` (operator `0xe57D7BD1eE0796a874C10121f797Ba36bC3dDA1c`) | `0xe16001360951c7afddb079b0d2f020bcc16b70066e6f071642b3e82ac2396dd5` | status 1 |
| `enroll(id, 3, 0)` with 0.03 MON | `0xdeccce92febf644fb7d82ed669c1f6724b9c41fa0206a8c8c0fe1dcc9534a54f` (block 68177666) | leaf index 1 |
| 3 RLN proofs verified against the on-chain root; 4th reuses a message id → secret recovered | off-chain | all PASS |
| `commitSlash` (slasher `0xb7B8388B9878f2d450C16623420Ed0CE8C0C237f`) | `0x6bd905215d9e17d3fa8fb119d38b358f4e870bd633dc3a3ae01dbca4b05675f0` (block 68177684) | status 1 |
| `revealSlash` | `0x82f899a72df079cfaa2b7959623115825c8b4be849aab7bc26effe084b8bb062` (block 68177704) | receiver `0x66e49F7E04Ec5609bd72AF1D5bE8f91221A437bC` +0.015 MON (5000 bps of 0.03); member `Slashed`; leaf removed in the same tx; `totalBurned` 0.015 MON |
| Sweep operator leftovers to deployer | `0x0eb94917906eba173f9b6250c3a3398d6b882bc1027307940354ad750137b010` | 0.277 MON returned |

**Leaf 0 of v2 is orphaned.** The first e2e attempt enrolled an agent (stake 0.03 MON), then failed on a read (Monad execution lag, since fixed). That operator's key existed only in memory and its secret is lost. Its leftover gas money, roughly 0.43 MON (not measured exactly), is stranded too. The leaf is harmless: nobody can prove with it.

## Phase 4: demo agent (registry v2, 2026-10-05)

Enrolled with `pnpm --filter @quota/devtools enroll-agent` (scripted operator with a software passkey). Agent RLN secret derived from `AGENT_PRIVATE_KEY` (`deriveSecret`); idCommitment `15655976155532526635563038073452362661942229565551089952311669819373754302596`, **index 2, limit 5, stake 0.05 MON**. The operator key was discarded, so this stake cannot be unstaked.

| Step | Tx |
|---|---|
| Fund operator `0x5a23e0406eFad8aa879b2969e2d93e6b0352F367` | `0x7610ba58277507909517eb570b4c381e21bac45d8c2ba29d3c85a6f308dc9f77` |
| `registerPasskey` (estimate 131,851) | `0x2a0aaeb8a4dc0fc7e6a55b7f13124966f8165f7cac64f8c6b5669a98e4a4876f` |
| `enroll` (estimate 1,282,562) | `0x10b267dcfbacf2c1efd8dc02fd4d73030da7d49146da69e90383f7960acec004` |
| Sweep 0.279 MON back to the deployer | `0x894f472125b179f5ff318f7c5855056c06f8130298dc6e6701213173e20576b6` |

## Gas

- Foundry model, depth 20 enroll (v1): **1,675,321 gas** (not a Monad measurement).
- Monad charges the gas **limit**, so receipts report `gasUsed` = the limit set. Figures below are **`eth_estimateGas` on Monad testnet** right before sending (v2, depth 20); the limit sent was estimate × 1.15:

| Call | eth_estimateGas | limit sent |
|---|---|---|
| `registerPasskey` | 131,839 | 151,614 |
| `enroll` (2nd leaf) | 1,299,685 | 1,494,637 |
| `commitSlash` | 51,902 | 59,687 |
| `revealSlash` (incl. leaf removal) | 2,370,123 | 2,725,641 |

- Cost of a slash for the slasher at ~102 gwei: about 0.284 MON (commit + reveal, billed on limits). With a 0.01 MON unit, a slash only pays the slasher if the stake is above ~0.57 MON at a 50% share. **Services must set a minimum stake well above this.**
- Registry v2 deploy: PoseidonT2 limit 2,721,284 and registry limit 5,395,438 (forge multiplier 1.15). About 0.84 MON in total.
- Registry deploy: constructor builds a depth-20 zero tree; receipt shows the 5,302,862 limit/charge, not the exact usage.
