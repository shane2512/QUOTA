import { dynamicEvmClient, type DynamicEvmClient } from "./dynamic-sdk.ts";
import type { Address, Hex, TransactionSerializable } from "viem";
import type { WalletAdapter } from "@quota/slasher";

/// PRD W3/W4: the service operator's wallet, used by the slasher to sign commit/reveal and to receive rewards.
/// A Dynamic server wallet (TWO_OF_TWO MPC). Our side keeps no key share: the external share is backed up to
/// Dynamic, encrypted with a password, and recovered for each signature. Sign-only: broadcasting is ours.
/// Delegated access (user-owned embedded wallet + webhook) is NOT used; see gates.md G3.
export class DynamicServiceWallet implements WalletAdapter {
  private constructor(
    private client: DynamicEvmClient,
    private metadata: Record<string, unknown>,
    private password: string, // DYNAMIC_WALLET_PASSWORD; never logged
    readonly address: Address,
    private apiToken?: string, // kept so the Dynamic session can be renewed (it expires; see signTransaction)
  ) {}

  #authedAt = Date.now();

  /// Wrap an already-authenticated client (also used by tests with a fake client).
  static fromClient(client: DynamicEvmClient, metadata: Record<string, unknown>, password: string): DynamicServiceWallet {
    return new DynamicServiceWallet(client, metadata, password, metadata.accountAddress as Address);
  }

  /// `metadataB64` is DYNAMIC_SLASHER_WALLET: base64 JSON of the walletMetadata returned at creation (ids and
  /// backup locations only, no key material).
  static async connect(o: { environmentId: string; apiToken: string; metadataB64: string; password: string }): Promise<DynamicServiceWallet> {
    const client = await dynamicEvmClient(o.environmentId);
    await client.authenticateApiToken(o.apiToken);
    const metadata = JSON.parse(Buffer.from(o.metadataB64, "base64").toString("utf8")) as Record<string, unknown>;
    return new DynamicServiceWallet(client, metadata, o.password, metadata.accountAddress as Address, o.apiToken);
  }

  /// The API-token session authenticated at startup EXPIRES: after a few hours Dynamic's key-share relay answers
  /// "Session validation failed: 401" and every retry on the same session fails the same way (a live slash failed
  /// exactly like that on 2026-10-09). So renew the session before it is old, and again after any failed attempt.
  static readonly SESSION_MAX_AGE_MS = 10 * 60_000;

  async #renew() {
    if (!this.apiToken) return;
    await this.client.authenticateApiToken(this.apiToken);
    this.#authedAt = Date.now();
  }

  /// Dynamic's MPC signing is also intermittently slow on testnet (one attempt timed out after ~99 s, the next took
  /// 7 s; progress.md 2026-10-05). Signing the same transaction again is harmless, since we broadcast once, so retry.
  async signTransaction(tx: TransactionSerializable, attempts = 3): Promise<Hex> {
    for (let i = 1; ; i++) {
      try {
        if (this.apiToken && Date.now() - this.#authedAt > DynamicServiceWallet.SESSION_MAX_AGE_MS) await this.#renew();
        return (await this.client.signTransaction({ walletMetadata: this.metadata, transaction: tx, password: this.password })) as Hex;
      } catch (e) {
        if (i >= attempts) throw e;
        this.onRetry?.(i, e instanceof Error ? e.message : String(e));
        await this.#renew().catch(() => undefined); // a failed renewal just means the next attempt reports the real error
      }
    }
  }

  onRetry?: (attempt: number, error: string) => void;

  toJSON(): unknown {
    return { address: this.address, provider: "dynamic" };
  }
}
