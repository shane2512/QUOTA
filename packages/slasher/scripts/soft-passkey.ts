/// TEST TOOLING ONLY. A software P-256 "authenticator" that produces WebAuthn assertions in the exact shape
/// QuotaRegistry verifies (authenticatorData, clientDataJSON, low-s r/s). It lets scripts drive the registry
/// without a human tap. It is NOT a passkey: no secure hardware, no user verification. Phase 1 proved a real
/// Windows Hello passkey on-chain (docs/deployments.md); this exists so the slash e2e can run unattended.
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export const Action = { RegisterPasskey: 0, Enroll: 1, RequestUnstake: 2, ChangeLimit: 3 } as const;

export interface Assertion {
  authenticatorData: Hex;
  clientDataJSON: string;
  r: bigint;
  s: bigint;
}

const sha256 = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest();
const b64urlToBig = (s: string) => BigInt(`0x${Buffer.from(s, "base64url").toString("hex")}`);

export class SoftPasskey {
  readonly x: bigint;
  readonly y: bigint;
  #key: KeyObject;

  constructor(
    readonly rpId: string,
    readonly origin: string,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.#key = privateKey;
    const jwk = publicKey.export({ format: "jwk" });
    this.x = b64urlToBig(jwk.x!);
    this.y = b64urlToBig(jwk.y!);
  }

  /// challenge = keccak256(abi.encode(chainId, registry, operator, action, keccak256(params), nonce))
  static challenge(chainId: number, registry: Address, operator: Address, action: number, params: Hex, nonce: bigint): Hex {
    return keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint256" }],
        [BigInt(chainId), registry, operator, action, keccak256(params), nonce],
      ),
    );
  }

  assert(challenge: Hex): Assertion {
    // rpIdHash || flags (UP|UV = 0x05) || signCount
    const ad = Buffer.concat([sha256(Buffer.from(this.rpId)), Buffer.from([0x05]), Buffer.from([0, 0, 0, 1])]);
    const ch = Buffer.from(challenge.slice(2), "hex").toString("base64url");
    const clientDataJSON = `{"type":"webauthn.get","challenge":"${ch}","origin":"${this.origin}","crossOrigin":false}`;
    const msg = Buffer.concat([ad, sha256(Buffer.from(clientDataJSON))]);
    const sig = sign("sha256", msg, { key: this.#key, dsaEncoding: "ieee-p1363" });
    const r = BigInt(`0x${sig.subarray(0, 32).toString("hex")}`);
    let s = BigInt(`0x${sig.subarray(32).toString("hex")}`);
    if (s > N / 2n) s = N - s;
    return { authenticatorData: `0x${ad.toString("hex")}`, clientDataJSON, r, s };
  }

  toJSON(): unknown {
    return { x: this.x.toString(16), y: this.y.toString(16) };
  }
}
