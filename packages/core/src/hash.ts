import { poseidon1, poseidon2 } from "poseidon-lite";
import { keccak256, toBytes, type Hex } from "viem";

/// BN254 scalar field. Every circuit signal lives in it.
export const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/// Circuit constants for the vendored RLN(20, 16) artifacts.
export const TREE_DEPTH = 20;
/// RangeCheck(16) only works for values below 2^16, so the per-epoch limit must stay at or below this.
export const MAX_LIMIT = 65535n;

/// keccak256 truncated to 248 bits, so the result is always a field element (Semaphore convention).
export function hashToField(data: Hex | Uint8Array | string): bigint {
  const bytes = typeof data === "string" && !data.startsWith("0x") ? toBytes(data) : data;
  return BigInt(keccak256(bytes as Hex | Uint8Array)) >> 8n;
}

export function identityCommitment(a0: bigint): bigint {
  return poseidon1([a0]);
}

/// Merkle leaf. Matches QuotaRegistry: PoseidonT3([idCommitment, limit]).
export function rateCommitment(idCommitment: bigint, limit: bigint): bigint {
  return poseidon2([idCommitment, limit]);
}

/// H(serverId, epoch): quotas are per server, and shares from different servers never share a line.
export function externalNullifier(serverId: string, epoch: bigint): bigint {
  return poseidon2([hashToField(serverId), epoch]);
}

export function epochOf(unixSeconds: number, epochLength: number): bigint {
  return BigInt(Math.floor(unixSeconds / epochLength));
}

export function mod(a: bigint): bigint {
  const r = a % SNARK_FIELD;
  return r < 0n ? r + SNARK_FIELD : r;
}

/// Modular inverse in the field (Fermat). a must be non-zero mod p.
export function inv(a: bigint): bigint {
  let base = mod(a);
  if (base === 0n) throw new Error("inverse of zero");
  let e = SNARK_FIELD - 2n;
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * base) % SNARK_FIELD;
    base = (base * base) % SNARK_FIELD;
    e >>= 1n;
  }
  return r;
}

/// Shamir two-point recovery: the shares (x1, y1), (x2, y2) lie on y = a0 + a1·x; returns a0.
export function recoverSecret(x1: bigint, y1: bigint, x2: bigint, y2: bigint): bigint {
  if (mod(x1 - x2) === 0n) throw new Error("shares have the same x");
  const a1 = mod((y2 - y1) * inv(x2 - x1));
  return mod(y1 - a1 * x1);
}
