import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";

/// Pure WebAuthn helpers for the operator console (no DOM, so they can be unit-tested in Node).
/// The challenge and parameter encodings must equal QuotaRegistry's (see docs/HANDOFF.md §5).

export const Action = { RegisterPasskey: 0, Enroll: 1, RequestUnstake: 2, ChangeLimit: 3 } as const;

export const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/// keccak256(abi.encode(chainId, registry, operator, uint8 action, keccak256(params), nonce))
export function challenge(o: { chainId: number; registry: Address; operator: Address; action: number; params: Hex; nonce: bigint }): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint256" }],
      [BigInt(o.chainId), o.registry, o.operator, o.action, keccak256(o.params), o.nonce],
    ),
  );
}

export const registerParams = (x: bigint, y: bigint): Hex => encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [x, y]);
export const enrollParams = (id: bigint, limit: bigint, treeId: bigint, value: bigint): Hex =>
  encodeAbiParameters([{ type: "uint256" }, { type: "uint64" }, { type: "uint256" }, { type: "uint256" }], [id, limit, treeId, value]);
export const unstakeParams = (id: bigint, destination: Address): Hex =>
  encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [id, destination]);

const big = (b: Uint8Array) => (b.length === 0 ? 0n : BigInt(toHex(b)));

/// Parse an ASN.1 DER ECDSA signature (SEQUENCE { INTEGER r, INTEGER s }) as WebAuthn returns it.
export function derToRS(der: Uint8Array): { r: bigint; s: bigint } {
  let i = 0;
  const byte = () => {
    if (i >= der.length) throw new Error("truncated DER signature");
    return der[i++];
  };
  const len = () => {
    const b = byte();
    if (b < 0x80) return b;
    const n = b & 0x7f;
    if (n === 0 || n > 2) throw new Error("unsupported DER length");
    let v = 0;
    for (let k = 0; k < n; k++) v = (v << 8) | byte();
    return v;
  };
  if (byte() !== 0x30) throw new Error("not a DER sequence");
  len();
  const ints: bigint[] = [];
  for (let k = 0; k < 2; k++) {
    if (byte() !== 0x02) throw new Error("expected DER integer");
    const l = len();
    if (i + l > der.length) throw new Error("truncated DER integer");
    ints.push(big(der.slice(i, i + l)));
    i += l;
  }
  return { r: ints[0], s: ints[1] };
}

/// The registry rejects high-s signatures (malleability), so normalise to s ≤ n/2.
export const lowS = (s: bigint) => (s > P256_N / 2n ? P256_N - s : s);

/// Uncompressed P-256 public key from a SubjectPublicKeyInfo DER (what getPublicKey() returns): the last 64 bytes.
export function spkiToXY(spki: Uint8Array): { x: bigint; y: bigint } {
  if (spki.length !== 91 || spki[spki.length - 65] !== 0x04) throw new Error("not an uncompressed P-256 SPKI key");
  const xy = spki.slice(-64);
  return { x: big(xy.slice(0, 32)), y: big(xy.slice(32)) };
}

export interface WireAssertion {
  authenticatorData: Hex;
  clientDataJSON: string;
  r: string; // decimal
  s: string; // decimal, low-s
}

export function wireAssertion(o: { authenticatorData: Uint8Array; clientDataJSON: Uint8Array; signature: Uint8Array }): WireAssertion {
  const { r, s } = derToRS(o.signature);
  return {
    authenticatorData: toHex(o.authenticatorData),
    clientDataJSON: new TextDecoder().decode(o.clientDataJSON),
    r: r.toString(),
    s: lowS(s).toString(),
  };
}

export const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
