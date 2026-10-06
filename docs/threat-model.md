# QUOTA — Threat Model

Scope: the contracts (`PasskeyAuth`, `QuotaRegistry`), the proof layer (`@quota/core`, `@quota/client`, `@quota/server`), the slasher, and the wallet integrations (Privy agent side, Dynamic service side). Status: **testnet prototype, our own contracts are unaudited.** Each claim below points at the code or test that backs it; anything not backed is listed under "Not defended".

## 1. What is protected, from whom

| Asset | Threat actors | Main defence |
|---|---|---|
| The operator's stake | a thief with the agent runtime or wallet key; a front-running leader/RPC operator; a rogue server | passkey-gated withdrawal, Privy policy, commit–reveal slash |
| The agent's secret `a0` | the server it talks to; a network observer; a compromised agent runtime | never sent; only one Shamir share per request; derived from a wallet signature |
| The agent's anonymity | servers, observers, other agents | RLN zero-knowledge proofs, per-server nullifiers |
| A service's quota | a flooding agent | stake at risk, slash on reuse of a message id |
| The slash reward | a block leader, an RPC operator, a competing searcher | commit–reveal |

**Network model.** Monad has no global public mempool; transactions go to the next few leaders. The realistic front-runner is therefore a **leader or RPC operator**, not "anyone watching a mempool".

## 2. Slashing (copy-and-steal)

| Threat | Defence | Evidence |
|---|---|---|
| A leader/RPC operator copies a one-step `slash(a0, …)` and takes the reward | Slash is `commitSlash(keccak256(a0, receiver, salt))`, then `revealSlash(a0, receiver, salt, …)` in a **later block**. The receiver is inside the commitment | `Slash.t.sol`: naive slash **is** stolen (proves the race is real); copied reveal reverts `NoCommitment`; same-block reveal reverts `RevealTooEarly`; later reveal reverts `NotSlashable`; an exact copy still pays our receiver |
| Someone commits to the same secret first | the first commit block is kept | `test_commit_firstBlockKept` |
| Slash the same agent twice | state becomes `Slashed`, can never re-enroll or unstake | `test_slash_twice_reverts`, `test_slashed_cannotReenrollOrUnstake` |
| Dodge a slash by unstaking | slash works while `Unstaking`; unstake delay (2 h) > epoch (1 h) + root TTL (10 min) | `test_slash_duringUnstaking_dodgeFails` |
| Self-slash to get the stake back | reward share must be < 100%; the rest is locked in the contract (`totalBurned`) | constructor `BadShare`; 50% share in v3 |
| Reward receiver reverts to block the slash | whole slash reverts, nothing is lost | `test_revertingReceiver_revertsWholeSlash` |
| Stale Merkle siblings stop the slash | the reveal still pays and sets `pendingRemoval`; anyone can finish with `removeSlashedLeaf` | `test_staleSiblings_paysThenRemovalCompletes` |

Residual: the reveal publishes `a0`. The reward is already locked to the committer, but the slashed agent's identity is public from then on (intended). **This is commit–reveal, not BTX**: BTX (Monad's encrypted mempool) is not available to us.

## 3. Custody (passkey)

| Threat | Defence | Evidence |
|---|---|---|
| Stolen agent/operator wallet key withdraws the stake | `requestUnstake`, `changeLimit`, `enroll` need a WebAuthn assertion from the operator's registered P-256 key, verified on-chain via the precompile at `0x100` | `QuotaRegistry.t.sol` (passkey-required tests) |
| Replay of an old assertion | per-operator nonce inside the signed challenge | `*_replayedAssertion_reverts` |
| Assertion reused on another chain, registry, operator, action or with other parameters | challenge = `keccak256(chainId, registry, operator, action, keccak256(params), nonce)` | `test_register_boundTo*`, `test_enroll_boundToParams`, `test_changeLimit_boundToNewLimit` |
| Attacker swaps the withdrawal address | destination is part of the signed params | `test_unstake_destinationBoundToAssertion` |
| Malformed or spoofed WebAuthn data | strict parser: type `webauthn.get`, fixed key order, challenge, origin allowlist, `rpIdHash`, UP, UV, low-s, signature | 19 tests in `PasskeyAuth.t.sol`, 16 of them negative (wrong type/origin/rpId/challenge, missing UP/UV, high-s, malformed JSON, tampered data, zero r) |
| Precompile missing on a chain | the call fails closed (empty return is a failure) | `PasskeyAuth._checkSignature` |
| Registering someone else's key | registration needs an assertion from that key | `test_register_requiresPossessionOfKey` |

Real hardware check: a Windows Hello credential was registered and used to enroll on registry v1 (Phase 1, `deployments.md`).

Residual and not defended:
- **A lost passkey strands the stake.** A registered passkey cannot be replaced (no recovery flow).
- **`rpId` and the origin allowlist are immutable**; a domain change means a new registry.
- **In the demo and Scout, the operator passkey is a software key** from `.env` (test tooling). In that path no human approves anything. Do not present it as human custody.
- A passkey does **not** prove a unique human. The stake provides the sybil cost.

## 4. Proofs and secrets

| Threat | Defence | Evidence |
|---|---|---|
| Forged membership or fake rate-limit proof | Groth16 verification against the pinned RLN-v2 verification key and a root the registry accepts (`isKnownRoot`) | `server` tests with real proofs; Phase 2/3 e2e |
| Reusing a proof on another server | external nullifier = `Poseidon(serverId, epoch)`; a proof for server A is rejected by server B | `phase2` exit check |
| Request tampering | payload hash is bound into the proof (`x`) | server tests (wrong payload → 401) |
| Recovering `a0` unlawfully | needs two shares for the same nullifier with different `x`; one honest request reveals one point | RLN construction; `phase2` check recovers `a0` exactly only after a reuse |
| `a0` at rest | derived from a wallet signature over a fixed domain string, never stored or logged | `deriveSecret`; no `a0` in logs (review of all `console.*`) |
| Tampered circuit artifacts | SHA-256 pinned in code; loader refuses mismatches | `loadArtifacts` |
| Trusted setup | we reuse the PSE `rln-20` ceremony output and ran no setup. Trust assumption: at least one honest ceremony participant | `packages/core/artifacts/rln-20/` |

Residual:
- **The agent must never reuse a message id.** A restarted agent with an in-memory usage store reuses id 0 and **slashes itself**. `FileUsageStore` persists counts; two processes sharing one identity can still collide.
- A compromised agent runtime that can obtain the derivation signature learns `a0` and can cheat to get its own operator slashed (griefing). The Privy policy limits what it can sign and spend, not what it can prove.
- The server's nullifier store must persist (`SqliteNullifierStore`). Losing it lets old reuses go undetected.
- `limit` ≤ 65535 (circuit range check).

## 5. Wallets (Privy and Dynamic)

- **Privy agent wallet** is owned by the operator's Privy user; our runtime key is an additional signer under an override policy that allows only registry transactions on chain 10143, value ≤ 1 MON, and `personal_sign` of `QUOTA/rln-secret/v1…`. Policies are default-deny. Evidence: live policy check 11/11 (`privy-policy-check`), unit test of the rules.
- **Dynamic slasher** is a server wallet (TWO_OF_TWO MPC, share backed up to Dynamic, password in `.env`). It signs commit/reveal and receives rewards. **Delegated access (embedded-wallet login) is not implemented.** The wallet password lives in `.env`; losing it strands the wallet (this already happened once, `deployments.md`).
- Both are used **sign-only**; broadcasting is ours. Contracts and SDK core import neither provider (providers are in `@quota/wallets`).
- The Dynamic Node SDK needs Linux/macOS.

## 6. Privacy limits (what anonymity means here)

- **The operator is public at enrollment** (their address and stake are on-chain). What is hidden is *which* enrolled agent made a given request.
- **Anonymity set = the non-removed leaves** in the tree at that moment. On the testnet demo that is **a handful of agents**, i.e. close to no anonymity. It only means something at scale.
- Cryptography hides identity, not metadata: IP address, timing, request content and tool arguments can still identify an agent. QUOTA does not add a network-layer mixnet.
- Requests to one server are unlinkable to each other; shares sent to different servers use different nullifiers.

## 7. Economics and abuse

- **Quotas are per server.** An agent can spend its limit at every server it joins, so total traffic is N × servers.
- **Stake must exceed abuse value.** At unit 0.1 MON and a 50% share, a limit-5 stake (0.5 MON) pays a 0.25 MON reward against about 0.2 MON slasher gas (measured: net +0.045 MON on v3). Small stakes are not worth slashing; services should set a minimum.
- **Recidivism is not addressed.** A slashed identity cannot re-enroll, but the operator can enroll a fresh identity. The planned Nansen screening tier was cut (free tier, mainnet-only data).
- A leaf stays valid for `ROOT_TTL` (10 min) after removal, so a removed agent can still prove briefly.

## 8. Not defended / out of scope

- Our contracts are **unaudited**. The libraries reused (zk-kit IMT, poseidon-solidity, PSE RLN circuits and ceremony) are third-party; their audit status is theirs, not ours.
- No BTX. No proof-of-personhood. No global rate budget. No payments. Not suitable for latency-critical endpoints (proof generation about 0.4–1.2 s, medians measured on laptops).
- No on-chain Groth16 verification; proofs are checked off-chain by each server.
- Operator passkey recovery, multi-passkey, and trust tiers (Screened/Compliant) are not built.
