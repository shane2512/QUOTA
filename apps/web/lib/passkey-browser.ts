import type { Hex } from "viem";
import { b64url, spkiToXY, unb64url, wireAssertion, type WireAssertion } from "./passkey-core";

/// Real WebAuthn in the browser. The credential's rpId is the site's hostname, which must equal the registry's
/// immutable rpId (quota-metro.vercel.app); anywhere else the contract rejects the assertion.

const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const hexBytes = (h: Hex) => Uint8Array.from(h.slice(2).match(/../g)!.map((b) => parseInt(b, 16)));

export interface StoredPasskey {
  id: string; // credential id, base64url
  x: string; // decimal
  y: string;
}
const key = (operator: string) => `quota:passkey:${operator.toLowerCase()}`;

export function loadPasskey(operator: string): StoredPasskey | null {
  try {
    return JSON.parse(localStorage.getItem(key(operator)) ?? "null");
  } catch {
    return null;
  }
}
export function savePasskey(operator: string, p: StoredPasskey) {
  try {
    localStorage.setItem(key(operator), JSON.stringify(p));
  } catch {
    // private window: the passkey still works through the browser's discoverable-credential picker
  }
}

export const supported = () => typeof window !== "undefined" && !!window.PublicKeyCredential && window.isSecureContext;

/// Create a user-verifying P-256 passkey on this device and return its public key.
export async function createPasskey(label: string): Promise<StoredPasskey> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { id: location.hostname, name: "QUOTA" },
      user: { id: buf(bytes(16)), name: label, displayName: label },
      challenge: buf(bytes(32)),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 = P-256, what the P256VERIFY precompile checks
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey creation was cancelled");
  const spki = (cred.response as AuthenticatorAttestationResponse).getPublicKey();
  if (!spki) throw new Error("this browser did not return the passkey's public key");
  const { x, y } = spkiToXY(new Uint8Array(spki));
  return { id: b64url(new Uint8Array(cred.rawId)), x: x.toString(), y: y.toString() };
}

/// Sign a registry challenge with the passkey (user verification required: PIN, fingerprint or face).
export async function signChallenge(challenge: Hex, credentialId?: string): Promise<WireAssertion> {
  const got = (await navigator.credentials.get({
    publicKey: {
      challenge: buf(hexBytes(challenge)),
      rpId: location.hostname,
      userVerification: "required",
      allowCredentials: credentialId ? [{ type: "public-key", id: buf(unb64url(credentialId)) }] : [],
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!got) throw new Error("passkey signing was cancelled");
  const r = got.response as AuthenticatorAssertionResponse;
  return wireAssertion({
    authenticatorData: new Uint8Array(r.authenticatorData),
    clientDataJSON: new Uint8Array(r.clientDataJSON),
    signature: new Uint8Array(r.signature),
  });
}
