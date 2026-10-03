import * as snarkjs from "snarkjs";
import {
  PROOF_HEADER,
  decodeProof,
  epochOf,
  externalNullifier,
  hashToField,
  identityCommitment,
  publicSignals,
  recoverSecret,
  registryAbi,
  type QuotaProof,
} from "@quota/core";
import type { Address, Hex, PublicClient } from "viem";

export interface Share {
  x: bigint;
  y: bigint;
}

/// (externalNullifier, nullifier) → first share seen (PRD Z4).
export interface NullifierStore {
  /// Atomically store `share` if the key is new; otherwise return the share already stored.
  record(epoch: bigint, externalNullifier: bigint, nullifier: bigint, share: Share): Promise<Share | undefined>;
  /// Drop everything older than `epoch`.
  prune(epoch: bigint): Promise<void>;
}

export class MemoryNullifierStore implements NullifierStore {
  #byEpoch = new Map<bigint, Map<string, Share>>();

  async record(epoch: bigint, en: bigint, n: bigint, share: Share): Promise<Share | undefined> {
    let m = this.#byEpoch.get(epoch);
    if (!m) this.#byEpoch.set(epoch, (m = new Map()));
    const key = `${en}|${n}`;
    const prev = m.get(key);
    if (!prev) m.set(key, share);
    return prev;
  }

  async prune(epoch: bigint): Promise<void> {
    for (const e of this.#byEpoch.keys()) if (e < epoch) this.#byEpoch.delete(e);
  }
}

export interface RootChecker {
  isKnownRoot(root: bigint): Promise<boolean>;
}

/// Asks the registry whether a root is current or superseded less than ROOT_TTL ago (PRD C6).
export class RegistryRootChecker implements RootChecker {
  #cache = new Map<bigint, { ok: boolean; at: number }>();
  constructor(
    private client: PublicClient,
    private registry: Address,
    private cacheMs = 5_000,
  ) {}

  async isKnownRoot(root: bigint): Promise<boolean> {
    const hit = this.#cache.get(root);
    if (hit && Date.now() - hit.at < this.cacheMs) return hit.ok;
    const ok = await this.client.readContract({
      address: this.registry,
      abi: registryAbi,
      functionName: "isKnownRoot",
      args: [root],
    });
    this.#cache.set(root, { ok, at: Date.now() });
    return ok;
  }
}

export interface Violation {
  /// Recovered RLN secret: enough to slash. Never log it.
  secret: bigint;
  idCommitment: bigint;
  epoch: bigint;
  externalNullifier: bigint;
  nullifier: bigint;
}

export type VerifyResult =
  | { ok: true; nullifier: bigint; epoch: bigint }
  | {
      ok: false;
      reason:
        | "malformed"
        | "bad-epoch"
        | "bad-external-nullifier"
        | "bad-payload"
        | "unknown-root"
        | "invalid-proof"
        | "replay"
        | "violation";
    };

export interface QuotaVerifierOptions {
  serverId: string;
  vkey: Record<string, unknown>;
  roots: RootChecker;
  store?: NullifierStore;
  epochLength?: number; // seconds, default 3600
  /// Also accept proofs for this many previous epochs (clock skew). Default 1.
  epochGrace?: number;
  now?: () => number; // unix seconds
  onViolation?: (v: Violation) => void | Promise<void>;
}

/// @quota/server verifier (PRD Z3, Z4, S2 core): checks a request's RLN proof and catches message-id reuse.
export class QuotaVerifier {
  readonly store: NullifierStore;
  constructor(private o: QuotaVerifierOptions) {
    this.store = o.store ?? new MemoryNullifierStore();
  }

  epoch(): bigint {
    return epochOf(this.o.now?.() ?? Date.now() / 1000, this.o.epochLength ?? 3600);
  }

  async verifyHeader(header: string | undefined, payloadHash: Hex): Promise<VerifyResult> {
    if (!header) return { ok: false, reason: "malformed" };
    let p: QuotaProof;
    try {
      p = decodeProof(header);
    } catch {
      return { ok: false, reason: "malformed" };
    }
    return this.verify(p, payloadHash);
  }

  async verify(p: QuotaProof, payloadHash: Hex): Promise<VerifyResult> {
    const now = this.epoch();
    if (p.epoch > now || p.epoch < now - BigInt(this.o.epochGrace ?? 1)) return { ok: false, reason: "bad-epoch" };
    if (p.externalNullifier !== externalNullifier(this.o.serverId, p.epoch)) {
      return { ok: false, reason: "bad-external-nullifier" };
    }
    if (p.x !== hashToField(payloadHash)) return { ok: false, reason: "bad-payload" };
    if (!(await this.o.roots.isKnownRoot(p.root))) return { ok: false, reason: "unknown-root" };
    let valid = false;
    try {
      valid = await snarkjs.groth16.verify(this.o.vkey, publicSignals(p), p.proof);
    } catch {
      valid = false;
    }
    if (!valid) return { ok: false, reason: "invalid-proof" };

    const prev = await this.store.record(p.epoch, p.externalNullifier, p.nullifier, { x: p.x, y: p.y });
    if (!prev) return { ok: true, nullifier: p.nullifier, epoch: p.epoch };
    if (prev.x === p.x) return { ok: false, reason: "replay" };

    const secret = recoverSecret(prev.x, prev.y, p.x, p.y);
    await this.o.onViolation?.({
      secret,
      idCommitment: identityCommitment(secret),
      epoch: p.epoch,
      externalNullifier: p.externalNullifier,
      nullifier: p.nullifier,
    });
    return { ok: false, reason: "violation" };
  }
}

export { PROOF_HEADER };
