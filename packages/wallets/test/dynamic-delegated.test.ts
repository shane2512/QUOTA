import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { DelegatedDynamicWallet, DelegationStore, WebhookError, parseWebhook, verifySignature, type Delegation } from "../src/dynamic-delegated.ts";

const SECRET = "whsec_test";
const sign = (body: string, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const created = JSON.stringify({ eventName: "wallet.delegation.created", data: { walletId: "w1", shareSetId: "s1", publicKey: "0xpub", userId: "u1", encryptedDelegatedShare: { ct: "x" }, encryptedWalletApiKey: { ct: "y" } } });
const decrypt = () => ({ decryptedDelegatedShare: { secretShare: new Uint8Array([1, 2, 3]), index: 7n }, decryptedWalletApiKey: "dyn_key" });
const base = { secret: SECRET, privateKeyPem: "pem", decrypt };

test("signature: valid, wrong secret, tampered body, missing header", () => {
  const body = Buffer.from(created);
  assert.equal(verifySignature(SECRET, sign(created), body), true);
  assert.equal(verifySignature(SECRET, sign(created).replace("sha256=", ""), body), true, "prefix is optional");
  assert.equal(verifySignature(SECRET, sign(created, "other"), body), false);
  assert.equal(verifySignature(SECRET, sign(created), Buffer.from(created + " ")), false);
  assert.equal(verifySignature(SECRET, undefined, body), false);
  assert.equal(verifySignature(SECRET, "sha256=", body), false);
});

test("created: verified, decrypted, mapped to a Delegation; a forged request is refused before decrypting", async () => {
  const ev = await parseWebhook({ ...base, rawBody: Buffer.from(created), signature: sign(created) });
  assert.equal(ev.kind, "created");
  if (ev.kind !== "created") return;
  assert.deepEqual([ev.delegation.walletId, ev.delegation.shareSetId, ev.delegation.walletApiKey], ["w1", "s1", "dyn_key"]);
  let decrypted = false;
  await assert.rejects(
    parseWebhook({ ...base, decrypt: () => ((decrypted = true), decrypt()), rawBody: Buffer.from(created), signature: sign(created, "forged") }),
    (e: unknown) => e instanceof WebhookError && e.status === 401,
  );
  assert.equal(decrypted, false);
});

test("revoked and unknown events; malformed bodies", async () => {
  const revoked = JSON.stringify({ eventName: "wallet.delegation.revoked", data: { walletId: "w1" } });
  assert.deepEqual(await parseWebhook({ ...base, rawBody: Buffer.from(revoked), signature: sign(revoked) }), { kind: "revoked", walletId: "w1" });
  const other = JSON.stringify({ eventName: "user.created", data: {} });
  assert.deepEqual(await parseWebhook({ ...base, rawBody: Buffer.from(other), signature: sign(other) }), { kind: "ignored", eventName: "user.created" });
  await assert.rejects(parseWebhook({ ...base, rawBody: Buffer.from("nope"), signature: sign("nope") }), (e: unknown) => e instanceof WebhookError && e.status === 400);
  const bad = JSON.stringify({ eventName: "wallet.delegation.created", data: { walletId: "w1" } });
  await assert.rejects(parseWebhook({ ...base, rawBody: Buffer.from(bad), signature: sign(bad) }), (e: unknown) => e instanceof WebhookError && e.status === 400);
  await assert.rejects(
    parseWebhook({ ...base, decrypt: () => { throw new Error("wrong key"); }, rawBody: Buffer.from(created), signature: sign(created) }),
    (e: unknown) => e instanceof WebhookError && e.status === 422,
  );
});

test("store: encrypted at rest, restored with the right password only, latest wins, delete persists", () => {
  const file = join(mkdtempSync(join(tmpdir(), "deleg-")), "d.json");
  const d = (id: string, at: number): Delegation => ({ walletId: id, walletApiKey: "dyn_key_secret", keyShare: { s: new Uint8Array([9, 8]), n: 5n }, createdAt: at });
  const s = new DelegationStore(file, "pw");
  s.set(d("a", 1));
  s.set(d("b", 2));
  assert.equal(s.latest()?.walletId, "b");
  const raw = readFileSync(file, "utf8");
  assert.ok(!raw.includes("dyn_key_secret") && !raw.includes("walletApiKey"), "nothing readable on disk");
  const back = new DelegationStore(file, "pw");
  assert.equal(back.load(), 2);
  const ks = back.get("a")!.keyShare as { s: Uint8Array; n: bigint };
  assert.deepEqual([...ks.s], [9, 8]);
  assert.equal(ks.n, 5n);
  assert.equal(new DelegationStore(file, "wrong").load(), 0);
  s.delete("b");
  assert.equal(new DelegationStore(file, "pw").load(), 1);
  assert.equal(new DelegationStore().load(), 0, "no file configured is fine");
});

test("wallet: the address comes from a recovered signature (not from the webhook), signing retries, a lying signer is exposed", async () => {
  const acct = privateKeyToAccount("0x" + "11".repeat(32) as `0x${string}`);
  const d: Delegation = { walletId: "w1", walletApiKey: "k", keyShare: {}, createdAt: 1 };
  let txCalls = 0;
  const api = {
    signMessage: (_: Delegation, m: string) => acct.signMessage({ message: m }),
    signTransaction: async () => {
      if (++txCalls < 3) throw new Error("mpc timeout");
      return "0x02aa";
    },
  };
  const w = await DelegatedDynamicWallet.connect(api, d);
  assert.equal(w.address, acct.address);
  const retries: number[] = [];
  w.onRetry = (n) => retries.push(n);
  assert.equal(await w.signTransaction({ chainId: 10143, to: acct.address, type: "eip1559" }), "0x02aa");
  assert.deepEqual(retries, [1, 2]);
  assert.deepEqual(w.toJSON(), { address: acct.address, provider: "dynamic-delegated" });
  await assert.rejects(DelegatedDynamicWallet.connect({ ...api, signMessage: async () => "0x1234" }, d));
});
