import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as snarkjs from "snarkjs";
import {
  MAX_LIMIT,
  PROOF_HEADER,
  SNARK_FIELD,
  encodeProof,
  epochOf,
  externalNullifier,
  fromPublicSignals,
  hashToField,
  identityCommitment,
  rateCommitment,
  type MerkleProof,
  type QuotaProof,
  type RlnArtifacts,
} from "@quota/core";
type Hex = `0x${string}`;

export class QuotaExhausted extends Error {
  constructor(serverId: string, epoch: bigint) {
    super(`quota exhausted for ${serverId} in epoch ${epoch}`);
  }
}

export interface QuotaClientOptions {
  /// RLN secret. Never logged, never serialized.
  secret: bigint;
  limit: bigint;
  artifacts: Pick<RlnArtifacts, "wasm" | "zkey">;
  /// Current Merkle proof for this agent's leaf against a root the registry still accepts.
  merkleProof: () => MerkleProof | Promise<MerkleProof>;
  epochLength?: number; // seconds, default 3600
  now?: () => number; // unix seconds
  /// Demo only (PRD D3): keep sending past the limit by reusing message ids, which leaks the secret.
  allowOveruse?: boolean;
  /// Where used message ids are counted. Default: memory. Use FileUsageStore for any agent that may restart
  /// within an epoch: a restarted agent that forgets its count would reuse ids and get itself slashed.
  usage?: UsageStore;
}

/// Next unused message id per `${serverId}|${epoch}`. set() must persist before returning.
export interface UsageStore {
  get(key: string): bigint | undefined;
  set(key: string, next: bigint): void;
}

export class MemoryUsageStore implements UsageStore {
  #m = new Map<string, bigint>();
  get(key: string) {
    return this.#m.get(key);
  }
  set(key: string, next: bigint) {
    this.#m.set(key, next);
  }
}

/// JSON file, written synchronously on every increment (before the proof is made). Node only.
export class FileUsageStore implements UsageStore {
  #m: Map<string, bigint>;
  constructor(private path: string) {
    mkdirSync(dirname(path), { recursive: true });
    let o: Record<string, string> = {};
    try {
      o = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    this.#m = new Map(Object.entries(o).map(([k, v]) => [k, BigInt(v)]));
  }
  get(key: string) {
    return this.#m.get(key);
  }
  set(key: string, next: bigint) {
    this.#m.set(key, next);
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries([...this.#m].map(([k, v]) => [k, v.toString()]))));
    renameSync(tmp, this.path);
  }
}

/// @quota/client (PRD S1): attaches an RLN-v2 proof to each request and tracks message ids per server and epoch.
export class QuotaClient {
  readonly idCommitment: bigint;
  readonly leaf: bigint;
  #secret: bigint;
  #opts: QuotaClientOptions;
  #used: UsageStore;

  constructor(opts: QuotaClientOptions) {
    if (opts.secret <= 0n || opts.secret >= SNARK_FIELD) throw new Error("secret out of field range");
    if (opts.limit <= 0n || opts.limit > MAX_LIMIT) throw new Error(`limit must be in 1..${MAX_LIMIT}`);
    this.#secret = opts.secret;
    this.#opts = opts;
    this.#used = opts.usage ?? new MemoryUsageStore();
    this.idCommitment = identityCommitment(opts.secret);
    this.leaf = rateCommitment(this.idCommitment, opts.limit);
  }

  epoch(): bigint {
    const now = this.#opts.now?.() ?? Date.now() / 1000;
    return epochOf(now, this.#opts.epochLength ?? 3600);
  }

  remaining(serverId: string, epoch = this.epoch()): bigint {
    const used = this.#used.get(`${serverId}|${epoch}`) ?? 0n;
    return used >= this.#opts.limit ? 0n : this.#opts.limit - used;
  }

  /// Proof for request `payloadHash` to `serverId`. Uses the next message id unless `messageId` is given.
  async prove(serverId: string, payloadHash: Hex, messageId?: bigint): Promise<QuotaProof> {
    const epoch = this.epoch();
    const key = `${serverId}|${epoch}`;
    const used = this.#used.get(key) ?? 0n;
    let k = messageId ?? used;
    if (messageId === undefined) {
      if (used >= this.#opts.limit) {
        if (!this.#opts.allowOveruse) throw new QuotaExhausted(serverId, epoch);
        k = used % this.#opts.limit; // reuse: the server can now recover the secret
      }
      this.#used.set(key, used + 1n);
    }
    if (k < 0n || k >= this.#opts.limit) throw new Error("message id out of range");

    const x = hashToField(payloadHash);
    if (x === 0n) throw new Error("x = 0 would reveal the secret");
    const extNull = externalNullifier(serverId, epoch);
    const mp = await this.#opts.merkleProof();
    if (mp.leaf !== this.leaf) throw new Error("merkle proof is not for this agent's leaf");

    const input = {
      identitySecret: this.#secret.toString(),
      userMessageLimit: this.#opts.limit.toString(),
      messageId: k.toString(),
      pathElements: mp.siblings.map(String),
      identityPathIndex: mp.pathIndices.map(String),
      x: x.toString(),
      externalNullifier: extNull.toString(),
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, this.#opts.artifacts.wasm, this.#opts.artifacts.zkey);
    return fromPublicSignals(proof, publicSignals, epoch);
  }

  /// PRD S1: signRequest(serverId, payloadHash) → headers.
  async signRequest(serverId: string, payloadHash: Hex): Promise<Record<string, string>> {
    return { [PROOF_HEADER]: encodeProof(await this.prove(serverId, payloadHash)) };
  }

  toJSON(): unknown {
    return { idCommitment: this.idCommitment.toString(), limit: this.#opts.limit.toString() };
  }
}

export * from "./helpers.ts";
