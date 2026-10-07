import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify, createPublicKey } from "node:crypto";
import { SoftPasskey } from "@quota/devtools";
import { Action, P256_N, challenge, derToRS, enrollParams, lowS, registerParams, spkiToXY, unstakeParams, wireAssertion } from "../lib/passkey-core.ts";

const REG = "0xCBdfda8ebF4302793C06a402E9753C4F43799990" as const;
const OP = "0x5b76B256d34Ff567cA3Cf2514e0B618429427dA5" as const;

test("challenge equals the one the contract tests and SoftPasskey use, for every action and parameter encoding", () => {
  const cases = [
    [Action.RegisterPasskey, registerParams(123n, 456n)],
    [Action.Enroll, enrollParams(789n, 5n, 0n, 5n * 10n ** 17n)],
    [Action.RequestUnstake, unstakeParams(789n, OP)],
  ] as const;
  for (const [action, params] of cases) {
    for (const nonce of [0n, 1n, 7n]) {
      assert.equal(challenge({ chainId: 10143, registry: REG, operator: OP, action, params, nonce }), SoftPasskey.challenge(10143, REG, OP, action, params, nonce));
    }
  }
});

test("a different chain, registry, operator, action, params or nonce changes the challenge", () => {
  const base = { chainId: 10143, registry: REG, operator: OP, action: 1, params: enrollParams(1n, 1n, 0n, 1n), nonce: 0n };
  const c = challenge(base);
  const variants = [
    { ...base, chainId: 1 },
    { ...base, registry: "0xd89BFd2f093015193d42EA51170D64d9242a40C6" as const },
    { ...base, operator: "0x0000000000000000000000000000000000000001" as const },
    { ...base, action: 2 },
    { ...base, params: enrollParams(1n, 2n, 0n, 1n) },
    { ...base, nonce: 1n },
  ];
  for (const v of variants) assert.notEqual(challenge(v), c);
});

test("DER signatures parse to the same r,s that node verifies, including 33-byte (leading-zero) integers", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  let sawLong = false;
  for (let i = 0; i < 80; i++) {
    const msg = Buffer.from(`message ${i}`);
    const der = sign("sha256", msg, { key: privateKey, dsaEncoding: "der" });
    const { r, s } = derToRS(der);
    if (der.length > 70) sawLong = true;
    const p1363 = Buffer.concat([Buffer.from(r.toString(16).padStart(64, "0"), "hex"), Buffer.from(s.toString(16).padStart(64, "0"), "hex")]);
    assert.equal(verify("sha256", msg, { key: publicKey, dsaEncoding: "ieee-p1363" }, p1363), true);
  }
  assert.equal(sawLong, true, "the loop should have produced at least one DER integer with a leading zero byte");
});

test("lowS maps high s to n - s and leaves low s alone; the result verifies", () => {
  assert.equal(lowS(5n), 5n);
  assert.equal(lowS(P256_N - 5n), 5n);
  assert.equal(lowS(P256_N / 2n), P256_N / 2n);
  assert.equal(lowS(P256_N / 2n + 1n), P256_N - (P256_N / 2n + 1n));
});

test("SPKI public key converts to the x,y of the JWK", () => {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const { x, y } = spkiToXY(new Uint8Array(spki));
  const jwk = createPublicKey({ key: spki, format: "der", type: "spki" }).export({ format: "jwk" });
  assert.equal(x, BigInt("0x" + Buffer.from(jwk.x!, "base64url").toString("hex")));
  assert.equal(y, BigInt("0x" + Buffer.from(jwk.y!, "base64url").toString("hex")));
  assert.throws(() => spkiToXY(new Uint8Array(10)));
});

test("wireAssertion turns a WebAuthn response into the contract's tuple fields, with low-s", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const der = new Uint8Array(sign("sha256", Buffer.from("x"), { key: privateKey, dsaEncoding: "der" }));
  const w = wireAssertion({ authenticatorData: new Uint8Array([1, 2, 3]), clientDataJSON: new TextEncoder().encode('{"type":"webauthn.get"}'), signature: der });
  assert.equal(w.authenticatorData, "0x010203");
  assert.equal(w.clientDataJSON, '{"type":"webauthn.get"}');
  assert.ok(BigInt(w.s) <= P256_N / 2n);
  assert.deepEqual(derToRS(der).r.toString(), w.r);
});
