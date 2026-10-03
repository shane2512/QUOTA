/// Wire format shared by @quota/client and @quota/server.

export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

/// One rate-limited request. Public signals of RLN(20,16), in circuit order:
/// [y, root, nullifier, x, externalNullifier].
export interface QuotaProof {
  proof: Groth16Proof;
  y: bigint;
  root: bigint;
  nullifier: bigint;
  x: bigint;
  externalNullifier: bigint;
  epoch: bigint;
}

export const PROOF_HEADER = "x-quota-proof";

export function publicSignals(p: QuotaProof): string[] {
  return [p.y, p.root, p.nullifier, p.x, p.externalNullifier].map(String);
}

export function fromPublicSignals(proof: Groth16Proof, s: string[], epoch: bigint): QuotaProof {
  if (s.length !== 5) throw new Error("expected 5 public signals");
  const [y, root, nullifier, x, externalNullifier] = s.map(BigInt);
  return { proof, y, root, nullifier, x, externalNullifier, epoch };
}

export function encodeProof(p: QuotaProof): string {
  const json = JSON.stringify({ proof: p.proof, signals: publicSignals(p), epoch: p.epoch.toString() });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeProof(header: string): QuotaProof {
  const o = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  if (!o || typeof o !== "object" || !o.proof || !Array.isArray(o.signals) || typeof o.epoch !== "string") {
    throw new Error("malformed proof header");
  }
  return fromPublicSignals(o.proof, o.signals, BigInt(o.epoch));
}
