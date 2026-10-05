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

## Phase 4 test run: phase3 e2e re-run on testnet (2026-10-05)

Re-run with `pnpm phase3` as part of the Phase 4 full test pass. 14/14 PASS.
Also fixed: Windows `import.meta.url` path bug (`fileURLToPath`) in devtools and demo-mcp scripts.

| Step | Tx | Notes |
|---|---|---|
| Fund operator `0x4093D5e7E88dDdc9531743E7a70604f10b1a8cbC` | `0xaaf8d1fd93cae980d8e6b16afdee2fdb038ffbafcfac9fdea168a28854c66ec7` | estimate 21,000 |
| `registerPasskey` | `0xceaaa437698012b8d0dc8a6dc766c85ced56123994b85892b949b39f4db32113` | estimate 131,851 |
| `enroll` (index 3, stake 0.03 MON) | `0xd65a1e18c04a5d59bf6d6b644032f0be1463b5c94af60527a1bb3b7029f577d5` | block 68347530, estimate 1,290,928 |
| `commitSlash` | `0x57006a5d001b427165ea75e13ab974a810fe00f6c6c3d56b0c6ebcd49017c47b` | block 68347545, estimate 51,914 |
| `revealSlash` | `0xfee479d1e5cac3771eb46ac1a996f3ed872c45e6fdb93668ede121bb51a83430` | block 68347567 (+22 from commit), receiver `0x05c2bF6F50D3C177C5AAB0Ade971C82F691411C8` +0.015 MON; member Slashed; leaf removed |
| Sweep back to funder | `0xf05078b0a7db9fa9e922b1602f7edac36b05680b1ec800a146de16b2a5101fe2` | 0.278 MON returned |

## Phase 4 live demo test: MCP server + agent (registry v2, 2026-10-05)

### Index 2 slash — Windows reset bug (accidental)

Demo agent (index 2, `AGENT_PRIVATE_KEY=0x2765...`) slashed during Phase 4 demo test. Root cause: `Remove-Item` on `nullifiers.db` while server still held a file handle (Windows). Server retained old nullifiers; agent re-sent same message IDs with different payloads → same nullifier, different x → violation. Slashed by `QUOTA_SLASH=1` server.

| Step | Tx |
|---|---|
| `commitSlash` (server-initiated) | `0x100aa65ed223145ff6bd65941ee04a454bb9be3b055fcdaa63376394913e6376` |
| `revealSlash` | `0x70869a4f04ad729fa046ec998cdcfad3b2fa423eb11d3288f5867a3a9bde97d9` |

**Lesson learned:** always stop the server before deleting state files. Documented in HANDOFF §6.

### Index 4 enroll and slash — correct --cheat demo

Re-enrolled a fresh agent (`AGENT_PRIVATE_KEY=0x5339...`), index 4, limit 5, stake 0.05 MON. Then ran proper cheat demo (server stopped → state cleared → server restarted with `QUOTA_SLASH=1` → agent `--cheat`): **5 × OK, 1 × REJECTED (violation 429)** → server slashed on-chain.

| Step | Tx |
|---|---|
| Fund operator `0xaaa0408f...` | `0x5399bfdd8ff3c7528dd9720f1ad78ed18a7de6510fc936f51b5695328f455fdc` |
| `registerPasskey` | `0x894d00634ff523c458ed133060e03da5f8885e6162177dca46bcd4f06bdb99bf` |
| `enroll` (index 4, stake 0.05) | `0xe18f27a2a76112c6a1a1c27848720afa24b81f5f7d667e69fe1fb3bd7e6b13da` |
| `sweep` | `0xe1b70fcd19a7b3681ef7cfe6ffb674e11e2e53cfcc38cc25313facb9045eedce` |
| `commitSlash` (server-initiated, `QUOTA_SLASH=1`) | `0x2e1dd2bb65d6975ae083b2bb9d2f59037227230cdccf1b7a6c6154304ade6cd9` |
| `revealSlash` | `0x17c8d78c8d4b02906a6e42e18aac96904c3b5a2ef6ecf1efab6c33ee21d54ca0` |

### Index 5 enroll — clean Phase 5 demo agent

Fresh agent (`AGENT_PRIVATE_KEY=0x4931...`), idCommitment `15477875465663548400315948804121926270608349604082804923542483643861837262875`, **index 5, limit 5, stake 0.05 MON**. This is the active demo agent for Phase 5.

| Step | Tx |
|---|---|
| Fund operator `0x568a2489...` | `0x9f6c7895527e7b902483ffd3ddc1d54ca5c46e33ccf9f5d9ffd2c8e130743b73` |
| `registerPasskey` | `0xb7066095d57a9004b080eb31c4b3ed1b0056effbba057303e7547e24b5667fa8` |
| `enroll` (index 5, stake 0.05) | `0x74261dd7023b62501f87a3e3f241943e0aca5a11f1f310a5cf5f1e3fe1545438` |
| `sweep` | `0x85d8dfc3ba916b1c33477205daf83c00af16d443950dbacd796dc340ca0ea863` |

## Phase 5: provider wallets (registry v2, 2026-10-05)

**Wallets.**

| Role | Address | Ids |
|---|---|---|
| Privy agent wallet (current, Monad) | `0x1Ec0d0992990008Bcf1555FFd809Ca78aE651aA6` | wallet `h9cwfdpmtvbiyr3sgwtt968g`, policy `cmubtk1vfo8pdrjjfbnmizpw` |
| Privy agent wallet (superseded, Monad) | `0x0cc23b3e7e89981Fcaf84E65972c621E76b74920` | wallet `ay2e0f6l46hkoxk75aj4v6xa`, policy `r9239h0nsnmdifpa9o26ue7m` |
| Privy agent wallet (anvil dev) | `0x8F87203cE9d60d7d9063aF7E22250102b73f2576` | wallet `dnhiwpo4lo0iaergbn2c44k5`, policy `g1vpo6d1snn4hxwu1r2vif45` |
| Dynamic slasher wallet | `0x7d150c30971cb7aE8Bf5e9Ce6deb79a12D92Aee1` | TWO_OF_TWO; share backed up to Dynamic |

- The superseded Privy wallet is the one used in the e2e below. Its software passkey existed only in memory, so it cannot approve another enroll.
- Every Privy agent wallet is owned by its operator user, with key quorum `cvlhfa0w46j966r07ahobnok` as an additional signer under the policy.

**1. `phase5-e2e.ts` on Monad (superseded Privy wallet, then the Dynamic slasher):** agent index 6 (limit 3), slashed.

| Step | Tx |
|---|---|
| Fund Privy wallet (0.23) | `0xdca1c3d1b699223cd11ba30a555f06bd2dcfd3281cd81ccb111c34ae0d22d05a` |
| `registerPasskey` (signed by Privy) | `0x9c7f6e3de72331cae6ef3d6160db9c608d7f862265d9246d697e177524932d1a` |
| `enroll` (signed by Privy, estimate 1,290,940) | `0xe20682f03153142ce9ce24289f3adfcab695a3c1b5ca2a89d5e8bc64bec8c724` |
| Fund Dynamic wallet | `0x7894993e5ed01059c139977ba9b7d86754342f9e6ef65671d03b69f0b9acfb03` |
| `commitSlash` (signed by Dynamic) | `0xd5a1fc652822790706b307b147e483347da93931ae0525349f860ed1d8e8caec` |
| `revealSlash` (signed by Dynamic, estimate 2,316,921) | `0xce975962327ee577a8ffc1895a679fd7bf558cca7454c879a9d29ff34ab4d5b6` |

Reward 0.015 MON to the Dynamic wallet. Its gas for commit + reveal was 0.278 MON at 120 gwei (billed on limits).

**2. Demo MCP server + Privy agent (current Privy wallet), slashed by the server's Dynamic slasher.**
- Identity 0: index 7, limit 5, **still Active**.
  - Fund `0x60cc2ffb19e42405f5af286af3228c8d141e236570e0bddaa2becd934a765537`.
  - `registerPasskey` `0xb9e105f2417f34b34e2a858de6f65060dfce5d07bd4eaa469c2055f8a1ac4bba`.
  - `enroll` `0x748a635ae2c4a4ae5f8b73d8403de050822797b7263a2131917b46c214aaf281`.
- Identity 1 (`QUOTA/rln-secret/v1/1`): index 8, limit 2.
  - Fund `0x2d3462fb9e7325316967f7487800942227e56e4d4c6aad2afa1cdb1ec0f90372`.
  - `enroll` `0x8121e405175a81e20101814987da20502ca32860bbbd8c4553888952584bc4da` (passkey reused, no re-registration).
  - 2 honest MCP calls, then a cheat → violation → slashed by the server: commit `0x7372a84d6166d2df232504898415cf424e0a7498002a6fc3204b65cc95af7381`, reveal `0x293a72e61a7d50fd5f357c784fe2a2f1a786546e6da8c48ceab1da136112381d` (sent from `0x7d15…Aee1`). Member state 4 (Slashed).
- Dynamic top-up before the demo: `0x0fbf9411994980e5f9f2ae83c4f5124f4545df2fd4d2419de949060c653a4407` (0.3 MON).
- Leaves 3–5 of v2 come from the Phase 4 re-verification runs (sections above).

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
