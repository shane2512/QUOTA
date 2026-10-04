import type { Address, Hex, TransactionSerializable } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/// PRD S4/W4: one interface for every wallet provider. Sign-only: the adapter never broadcasts,
/// so every transaction goes out through our own Broadcaster / SubmitPath.
export interface WalletAdapter {
  readonly address: Address;
  signTransaction(tx: TransactionSerializable): Promise<Hex>;
}

/// Plain private key held in process memory. For tests and local development.
export class LocalKeyWallet implements WalletAdapter {
  readonly address: Address;
  #account: ReturnType<typeof privateKeyToAccount>;

  constructor(privateKey: Hex) {
    this.#account = privateKeyToAccount(privateKey);
    this.address = this.#account.address;
  }

  signTransaction(tx: TransactionSerializable): Promise<Hex> {
    return this.#account.signTransaction(tx);
  }

  toJSON(): unknown {
    return { address: this.address };
  }
}
