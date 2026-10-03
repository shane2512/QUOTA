# Deployments (Monad testnet, chain 10143)

| Contract | Address | Tx | Notes |
|---|---|---|---|
| PoseidonT3 (linked library) | `0x791112caa53a60b6353a07c7501d41e750095422` | `0x388510bc…912e` | CREATE2, block 67905047 |
| QuotaRegistry **v0 (superseded)** | `0x5BaF5568e1dc363781b74d33B89d0e9f4f0D19ad` | `0xe5930e36…2c32` | origin allowlist only `localhost:3000`; not used |
| QuotaRegistry **v1 (current, dev)** | `0x05a5fe209E19C6707e2E701A76A0C94b2351E0ac` | `0x5df69d77…77c9` | rpId `localhost`; origins `localhost:3000`, `localhost:3777`; depth 20; unit 0.01 MON; unstake delay 2 h; root TTL 10 min |
| Hello (Phase 0) | `0x30A8e23Db6A8959913986336C749d7C8FCbFF0cf` | `0xf5b1578a…4ae3` | smoke test, source removed from repo |

`rpId` and allowed origins are immutable, so the registry must be redeployed for the final public domain (Phase 7). Source verification on the explorer is not done yet.

## Phase 1 exit check: real passkey on-chain

Passkey: a Windows Hello platform credential created in Chrome at `http://localhost:3777` (tool: `contracts/tools/passkey-demo`).
Operator wallet: throwaway deployer `0x0437938E18Bd2E6d8Cad0921C8dc1e7Ff28Df7b2`.

| Step | Tx | Result |
|---|---|---|
| `registerPasskey(x, y, assertion)` | `0x680fb30a0958cdc5fe58b5aca350a81cd5f4932f16878df5aa26815f79b741a8` (block 67906695) | status 1; `passkeys(op)` returns the credential's x/y; nonce 1 |
| `enroll(id, 1, 0, assertion)` with 0.01 MON | `0xad7f17bcfdfca91dd797110fcbe7f646391b9d044e29f0b23a211b3cc17b9203` (block 67906994) | status 1; `numberOfLeaves` 1; member Active, limit 1, stake 0.01 MON; nonce 2 |

Replay protection observed live: the first enroll assertion (signed with nonce 0 before registration) was not submitted because the registry nonce had moved to 1; a fresh assertion was required.

## Gas

- Foundry model, depth 20 enroll: **1,675,321 gas** (not a Monad measurement).
- Monad charges the gas **limit**, so receipts report `gasUsed` = the limit we set (3,000,000). The real consumption of enroll on Monad is **not yet measured**. Next: `eth_estimateGas` on the next enroll before sending.
- Registry deploy: constructor builds a depth-20 zero tree; receipt shows the 5,302,862 limit/charge, not the exact usage.
