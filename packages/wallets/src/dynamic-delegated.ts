import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { recoverMessageAddress, type Address, type Hex, type TransactionSerializable } from "viem";
import type { WalletAdapter } from "@quota/slasher";

/// Dynamic delegated access, service side. A service operator signs in to Dynamic with an embedded wallet in the
/// browser and approves "let QUOTA's slasher sign for me". Dynamic then POSTs an encrypted `wallet.delegation.created`
/// webhook to us; we verify it, decrypt the signing material with our RSA private key, keep it encrypted at rest,
/// and sign slashes from the operator's own wallet (so the slash reward lands in THEIR wallet, not ours).
/// Revocation arrives as `wallet.delegation.revoked` and removes the material. Sign-only: broadcasting stays ours.

/// Everything needed to sign for one delegated wallet (from the webhook after decryption).
export interface Delegation {
  walletId: string;
  shareSetId?: string;
  walletApiKey: string; // bearer token for this wallet; never logged
  keyShare: unknown; // ServerKeyShare; never logged
  publicKey?: string;
  userId?: string;
  createdAt: number;
}

export type WebhookEvent =
  | { kind: "created"; delegation: Delegation }
  | { kind: "revoked"; walletId: string }
  | { kind: "ignored"; eventName: string };

export class WebhookError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type Decrypt = (o: { privateKeyPem: string; encryptedDelegatedKeyShare: unknown; encryptedWalletApiKey: unknown }) => {
  decryptedDelegatedShare: unknown;
  decryptedWalletApiKey: string;
};

/// HMAC-SHA256 over the RAW body (before any JSON parsing), compared in constant time. Accepts "sha256=<hex>" or "<hex>".
export function verifySignature(secret: string, header: string | undefined, rawBody: Buffer): boolean {
  if (!header) return false;
  const given = header.replace(/^sha256=/i, "").trim();
  const want = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(given, "hex"), b = Buffer.from(want, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/// Verify, then decrypt. Throws WebhookError(401) on a bad signature and 400 on a malformed body.
export async function parseWebhook(o: { rawBody: Buffer; signature: string | undefined; secret: string; privateKeyPem: string; decrypt?: Decrypt }): Promise<WebhookEvent> {
  if (!verifySignature(o.secret, o.signature, o.rawBody)) throw new WebhookError(401, "bad signature");
  let body: { eventName?: string; data?: Record<string, unknown> };
  try {
    body = JSON.parse(o.rawBody.toString("utf8"));
  } catch {
    throw new WebhookError(400, "body is not JSON");
  }
  const d = body.data ?? {};
  if (body.eventName === "wallet.delegation.revoked") {
    if (typeof d.walletId !== "string") throw new WebhookError(400, "revoked event without walletId");
    return { kind: "revoked", walletId: d.walletId };
  }
  if (body.eventName !== "wallet.delegation.created") return { kind: "ignored", eventName: String(body.eventName) };
  if (typeof d.walletId !== "string" || !d.encryptedDelegatedShare || !d.encryptedWalletApiKey) throw new WebhookError(400, "created event is missing fields");
  const decrypt: Decrypt = o.decrypt ?? ((await import("@dynamic-labs-wallet/node")) as unknown as { decryptDelegatedWebhookData: Decrypt }).decryptDelegatedWebhookData;
  let out;
  try {
    out = decrypt({ privateKeyPem: o.privateKeyPem, encryptedDelegatedKeyShare: d.encryptedDelegatedShare, encryptedWalletApiKey: d.encryptedWalletApiKey });
  } catch {
    throw new WebhookError(422, "could not decrypt (is the RSA key the one registered in the Dynamic dashboard?)");
  }
  return {
    kind: "created",
    delegation: {
      walletId: d.walletId,
      shareSetId: typeof d.shareSetId === "string" ? d.shareSetId : undefined,
      walletApiKey: out.decryptedWalletApiKey,
      keyShare: out.decryptedDelegatedShare,
      publicKey: typeof d.publicKey === "string" ? d.publicKey : undefined,
      userId: typeof d.userId === "string" ? d.userId : undefined,
      createdAt: Date.now(),
    },
  };
}

// ---- encrypted store

/// JSON that survives Uint8Array and bigint (key shares may contain either).
const replacer = (_: string, v: unknown) =>
  v instanceof Uint8Array ? { __u8: Buffer.from(v).toString("base64") } : typeof v === "bigint" ? { __big: v.toString() } : v;
const reviver = (_: string, v: unknown) => {
  const o = v as { __u8?: string; __big?: string } | null;
  if (o && typeof o === "object" && typeof o.__u8 === "string") return new Uint8Array(Buffer.from(o.__u8, "base64"));
  if (o && typeof o === "object" && typeof o.__big === "string") return BigInt(o.__big);
  return v;
};

/// Delegations held in memory and, when a file and password are given, re-encrypted at rest (AES-256-GCM, scrypt key).
/// ponytail: one file, whole-map rewrite. On Render's free plan the disk resets on deploy, so a delegation must be
/// re-approved after a deploy; a database would fix that.
export class DelegationStore {
  #map = new Map<string, Delegation>();
  constructor(private file?: string, private password?: string) {}

  set(d: Delegation) {
    this.#map.set(d.walletId, d);
    this.save();
  }
  delete(walletId: string) {
    this.#map.delete(walletId);
    this.save();
  }
  get(walletId: string) {
    return this.#map.get(walletId);
  }
  /// The most recently approved delegation wins.
  latest(): Delegation | undefined {
    return [...this.#map.values()].sort((a, b) => b.createdAt - a.createdAt)[0];
  }
  get size() {
    return this.#map.size;
  }

  save() {
    if (!this.file || !this.password) return;
    const salt = randomBytes(16), iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", scryptSync(this.password, salt, 32), iv);
    const ct = Buffer.concat([c.update(JSON.stringify([...this.#map.values()], replacer), "utf8"), c.final()]);
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ v: 1, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") }), { mode: 0o600 });
  }

  /// Returns how many delegations were restored (0 if there is no file or it cannot be decrypted).
  load(): number {
    if (!this.file || !this.password || !existsSync(this.file)) return 0;
    try {
      const f = JSON.parse(readFileSync(this.file, "utf8"));
      const d = createDecipheriv("aes-256-gcm", scryptSync(this.password, Buffer.from(f.salt, "base64"), 32), Buffer.from(f.iv, "base64"));
      d.setAuthTag(Buffer.from(f.tag, "base64"));
      const json = Buffer.concat([d.update(Buffer.from(f.ct, "base64")), d.final()]).toString("utf8");
      for (const x of JSON.parse(json, reviver) as Delegation[]) this.#map.set(x.walletId, x);
      return this.#map.size;
    } catch {
      return 0;
    }
  }
}

// ---- the delegated wallet

/// The narrow slice of the Dynamic Node SDK we use, so tests can fake it. (node-evm 1.1.28's typings do not resolve
/// under NodeNext, see dynamic-sdk.ts, so the real functions are loaded lazily and typed locally.)
export interface DelegatedApi {
  signMessage(d: Delegation, message: string): Promise<string>;
  signTransaction(d: Delegation, tx: TransactionSerializable): Promise<string>;
}

export async function dynamicDelegatedApi(o: { environmentId: string; apiToken: string }): Promise<DelegatedApi> {
  const sdk = (await import("@dynamic-labs-wallet/node-evm")) as unknown as {
    createDelegatedEvmWalletClient(o: { environmentId: string; apiKey: string }): unknown;
    delegatedSignMessage(c: unknown, p: Record<string, unknown>): Promise<string>;
    delegatedSignTransaction(c: unknown, p: Record<string, unknown>): Promise<string>;
  };
  // The client is long-lived on the server. After any failure build a fresh one, so a stale session or connection
  // cannot make every retry fail the same way (the server-wallet path did exactly that, see dynamic.ts).
  const make = () => sdk.createDelegatedEvmWalletClient({ environmentId: o.environmentId, apiKey: o.apiToken });
  let client = make();
  const base = (d: Delegation) => ({ walletId: d.walletId, shareSetId: d.shareSetId, walletApiKey: d.walletApiKey, keyShare: d.keyShare });
  const run = async <T>(f: (c: unknown) => Promise<T>): Promise<T> => {
    try {
      return await f(client);
    } catch (e) {
      client = make();
      throw e;
    }
  };
  return {
    signMessage: (d, message) => run((c) => sdk.delegatedSignMessage(c, { ...base(d), message })),
    signTransaction: (d, transaction) => run((c) => sdk.delegatedSignTransaction(c, { ...base(d), transaction })),
  };
}

export class DelegatedDynamicWallet implements WalletAdapter {
  onRetry?: (attempt: number, error: string) => void;
  private constructor(private api: DelegatedApi, private d: Delegation, readonly address: Address) {}

  /// The wallet's address is not trusted from the webhook or the browser: we sign a one-off challenge with the
  /// delegated key and recover the signer, which proves the delegation really controls that address.
  static async connect(api: DelegatedApi, d: Delegation): Promise<DelegatedDynamicWallet> {
    const message = `QUOTA delegated slasher check ${randomBytes(8).toString("hex")}`;
    const signature = (await api.signMessage(d, message)) as Hex;
    const address = await recoverMessageAddress({ message, signature });
    return new DelegatedDynamicWallet(api, d, address);
  }

  /// MPC signing is intermittently slow on testnet; signing the same transaction again is harmless (we broadcast once).
  async signTransaction(tx: TransactionSerializable, attempts = 3): Promise<Hex> {
    for (let i = 1; ; i++) {
      try {
        return (await this.api.signTransaction(this.d, tx)) as Hex;
      } catch (e) {
        if (i >= attempts) throw e;
        this.onRetry?.(i, e instanceof Error ? e.message : String(e));
      }
    }
  }

  toJSON(): unknown {
    return { address: this.address, provider: "dynamic-delegated" };
  }
}
