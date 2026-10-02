# Monad Metropolis — Trust, Identity & AI Infrastructure: 3 ideas (final, after 3 contradictor cycles)

Shared thesis: **ERC-8004 has no sybil resistance by design** (the spec says so). Its trust signals are free to fake and fully public. All three ideas are primitives that make ERC-8004 signals *costly*, *private*, or *enforceable* — composable, no new registry, nothing a single platform owns.

Tech facts the designs rely on:
- P256VERIFY precompile at `0x100` (6,900 gas).
- ERC-8004 singletons on Monad (Identity `0x8004A169…a432`, Reputation `0x8004BAa1…9b63`, Validation).
- Monad has **no global mempool** (txs forward to the next 3 leaders), so the front-running adversary is a leader or RPC operator.
- BTX is not confirmed on public testnet. Every BTX path has a documented fallback behind one `SubmitPath` interface.

---

## A — VOUCH (the simple one, uses ALL tech)
**Passkey-bound escrow for hiring agents; every settled job writes costly, human-confirmed feedback into ERC-8004.**

| Call | What happens | Tech |
|---|---|---|
| `open(agentId, specHash, amount)` | Human taps passkey; challenge = keccak(chainId, escrow, jobId, agentId, specHash, amount, nonce). Full WebAuthn checks: type, challenge, origin, rpIdHash, UP/UV, low-s. Requester must not be the agent's owner/operator (the escrow is msg.sender to 8004, so it re-enforces the spec's own check). Their AI agent can draft jobs but can't fund one without a device tap. | P256 |
| `deliver(jobId, encDeliverable)` | Agent delivers atomically in 1 tx through BTX. **Race closed:** in open-bounty mode (`agentId=0`, first valid delivery wins), a leader- or RPC-colluding agent that sees a rival's pending delivery would jump ahead of it. Same for a requester who buys the slot to `cancel()` after reading its own decryptable deliverable. Fallback: commit→lock→reveal (2 txs + lock window). | BTX |
| `settle(jobId, score)` | Second tap → release minus 1% fee → escrow calls `giveFeedback`. | ERC-8004 |
| `VouchScore.of(agentId)` | Fee × sqrt(per-payer volume). Wash-trading isn't impossible, it's **priced**, and one whale loop scores lower than many real payers. Consumers: `getSummary(agentId, [VouchEscrow], …)`. | ERC-8004 |

- **Honest BTX claim:** 1-tx atomic delivery with no lock window. Commit-reveal also works; it's just slower and clunkier.
- **Day-1 check:** ask Monad devrel whether BTX hides the target and calldata or only the payload. If the sender is visible, route deliveries through a relayer.
- **Adopters to court:** Monad agent launchpads and marketplaces on ERC-8004, and Envio's ERC-8004 indexer (ship a VouchScore template).
- **Build scope:** 1 contract, 1 view, TS SDK (`vouch.open/deliver/settle/score`), plus heavy tests on WebAuthn parsing (that's the 20% Technical score).

## B — HUSH (ZK; client agents prove, never reveal)
**Anonymous verified-purchase feedback for ERC-8004.**

> **Cycle 4 verdict: PIVOT.** Not a standalone project. It becomes an opt-in **private-review mode inside VOUCH**. Build it only if it fits in ≤2 days; otherwise it's a roadmap slide.

- **Problem (re-scoped):** hiring an agent is already public (`open` publishes payer, agentId and amount). HUSH does **not** hide who hired whom. It hides **who gave which score**, so reviews are retaliation-resistant but still backed by payment. No client-privacy claim.
- **Mechanism (fixed):**
  - The payer supplies a Semaphore commitment at **`settle`**, not `open`. Adding it at `open` would let anyone open and cancel for free and still get a review right. Cancelled jobs never get a leaf.
  - The escrow batches leaves into the per-agent group via `addMembers` after a delay, in shuffled order (breaks timing links).
  - At settle, the payer chooses: **public review** (normal VOUCH `giveFeedback`) or **private review**. Private is only available once the agent's group has k ≥ 10 leaves.
  - Private review = Semaphore v4 proof, nullifier scoped to agentId. **Permissionless relaying**: anyone can submit, the proof is bound to the message, and gas is paid from the fee pool. `HushGate` then calls `giveFeedback`.
- **ERC-8004 fixes:** `HushGate` is a single clientAddress, so consumers that count unique reviewers would see one voice. Ship a `HushScore` view that counts leaves, not addresses. Store nullifier → feedbackIndex so a second proof with the same nullifier can revoke (checked with the view `verifyProof`).
- **Honest limits:**
  - Useless for small agents (k < 10). It helps big agents most, which need it least.
  - The sqrt(per-payer) anti-whale weighting is lost. Weight by job fee tier (put the tier in the commitment) instead.
  - The owner can self-pay and review anonymously, at the same 1% cost. Publish the group's funding clusters.
  - No named consumer is asking for anonymous feedback.
- **Deploy:** Semaphore isn't on Monad, so deploy `SemaphoreVerifier` + `Semaphore` yourself. No custom circuit.

## C — QUOTA (ZK + BTX + passkey; agent-to-service)
**Staked, slashable, anonymous rate limits for agent traffic. No issuer.**

- **Enrollment:** a passkey assertion over (identityCommitment, stake, tier) enrolls the agent in the QuotaRegistry Merkle tree. Tier is linear in stake, so splitting a stake gains nothing. **Unstaking and tier changes also need the passkey**, so a stolen agent operator key can't drain the stake (that's the load-bearing P256 use).
- **Per request:** RLN-v2 proof (PSE circuits) + Shamir share, verified off-chain in ms. The external nullifier is H(serverId, epoch), so quotas are per server (N each) and shares from different servers never collide. A recent-roots window documents the removal TTL.
- **Overuse:** two shares → secret recovered → `slash(secret, receiver)` via **BTX**.
  - A public slash tx reveals the secret, so whoever sees it (a leader or RPC on Monad) can copy it and steal the stake reward. The RLN audit flagged exactly this race.
  - Fallback: commit(H(secret, receiver)) → reveal.
- **Lead line vs Apple/Cloudflare ARC (Privacy Pass):** no issuer, permissionless, economically slashable, onchain.
- **Target:** scraping-facing APIs and MCP hosts. Not public RPC, where per-request proof latency hurts.

---

### What got killed along the way (and why)
- **SEALBID** (sealed-bid agent auctions): BTX decrypts per block, so earlier bids become visible, and the auction pattern is generic.
- **HEARSAY** (zk credentials about users): the issuers would be self-run mocks. Polygon ID, zkPass and Reclaim already cover this.
- **QUORUM-OF-ONE**: a passkey doesn't prove a unique human, synced passkeys give no attestation, and World AgentKit already covers human-backed agents.
- **WARRANT** (ZK delegation chains): nobody is asking for it, on-chain funding flows would deanonymize the principal, and budgets can't be tracked across requests.
- **RECEIPT** (zkTLS proof-of-model): model laundering beats the hash check, the crowd is already there (Opacity, EigenAI, Atoma), and a live TLSNotary demo against a real LLM API is too risky in 12 days.

### Ranking (contradictor, cycle 4; each criterion scored 1–10, total out of 10)

| # | Idea | Tech 20% | DevEx 20% | Originality 15% | Market 25% | Traction 20% | **Total** |
|---|---|---|---|---|---|---|---|
| 1 | **VOUCH** | 7 | 7 | 5 | 5 | 5 | **5.80** |
| 2 | **QUOTA** | 7 | 6 | 6 | 5 | 4 | **5.55** |
| 3 | **HUSH** | 5 | 6 | 4 | 3 | 3 | **4.15** |

- **VOUCH:** real WebAuthn plus a genuine BTX race with fallback; 3 calls + SDK. Originality is moderate (escrow + priced feedback). Market is plausible but no one has committed.
- **QUOTA:** the strongest originality (no issuer, slashable, unlike ARC). Market risk: sellers may prefer to identify their clients. Needs one MCP host or API to adopt.
- **HUSH:** off-the-shelf Semaphore, but held back by tiny anonymity sets, public `open`, and no demand.

**Pick: VOUCH.** It's the only one that meets the simple all-tech rule and it's the most shippable. VOUCH + HUSH's private mode beats VOUCH alone only if the private mode costs ≤2 days and is done right (membership at settle, batching, k threshold). The rubric names "privacy-preserving", so it helps Originality.

### Biggest remaining risk (all ideas)
Founder/Market (25%) and Traction (20%): no named integrator yet. This week, get one Monad marketplace, launchpad or indexer to commit to integrating VouchScore or HushGate during the hackathon.
