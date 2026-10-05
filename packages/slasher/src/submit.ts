import { randomBytes } from "node:crypto";
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { registryAbi } from "@quota/core";
import type { WalletAdapter } from "./wallet.ts";

export interface BroadcasterOptions {
  /// Gas limit = estimate × (1 + headroom). Monad bills the limit, not gas used, so keep it tight.
  gasHeadroom?: number; // default 0.15
  /// Monad testnet rejected a 10 gwei max fee; gas price is ~102 gwei. Floor for maxFeePerGas.
  minMaxFeePerGas?: bigint; // default 200 gwei
  /// Fixed max fee per gas (overrides the estimate and the floor). Lowers the balance a sender must hold,
  /// since Monad checks limit × max fee + value up front.
  maxFeePerGas?: bigint;
  /// Monad reserve balance: a value transfer that leaves the sender below RESERVE_WEI reverts at execution unless it
  /// is the sender's first transaction in the reserve window. Before such a transfer, wait this many blocks after
  /// the sender's previous transaction (sent through this Broadcaster). Default 4; 0 disables.
  reserveWindowBlocks?: number;
}

/// docs.monad.xyz/developer-essentials/reserve-balance (10 MON default reserve).
export const MONAD_RESERVE_WEI = 10n * 10n ** 18n;

export interface Sent {
  hash: Hex;
  receipt: TransactionReceipt;
  gasLimit: bigint;
  gasEstimate: bigint;
}

/// Builds, signs (via the adapter) and broadcasts transactions; waits for the receipt.
export class Broadcaster {
  constructor(
    readonly client: PublicClient,
    readonly wallet: WalletAdapter,
    private o: BroadcasterOptions = {},
  ) {}

  #lastBlock?: bigint;

  async send(to: Address, data: Hex, value = 0n): Promise<Sent> {
    const from = this.wallet.address;
    const window = BigInt(this.o.reserveWindowBlocks ?? 4);
    if (value > 0n && window > 0n && this.#lastBlock !== undefined) {
      const balance = await this.client.getBalance({ address: from });
      if (balance - value < MONAD_RESERVE_WEI) {
        while ((await this.client.getBlockNumber()) <= this.#lastBlock + window) await new Promise((r) => setTimeout(r, 400));
      }
    }
    const [nonce, chainId, gasEstimate, fees] = await Promise.all([
      this.client.getTransactionCount({ address: from, blockTag: "pending" }),
      this.client.getChainId(),
      this.client.estimateGas({ account: from, to, data, value }),
      this.client.estimateFeesPerGas(),
    ]);
    const headroom = BigInt(Math.round((this.o.gasHeadroom ?? 0.15) * 1000));
    const gasLimit = gasEstimate + (gasEstimate * headroom) / 1000n;
    const floor = this.o.minMaxFeePerGas ?? 200_000_000_000n;
    const maxFeePerGas = this.o.maxFeePerGas ?? (fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor);
    const raw = await this.wallet.signTransaction({
      type: "eip1559",
      chainId,
      nonce,
      to,
      data,
      value,
      gas: gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000_000n,
    });
    const hash = await this.client.sendRawTransaction({ serializedTransaction: raw });
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    this.#lastBlock = receipt.blockNumber;
    if (receipt.status !== "success") throw new Error(`transaction reverted: ${hash}`);
    return { hash, receipt, gasLimit, gasEstimate };
  }
}

export interface SlashRequest {
  secret: bigint; // never logged
  receiver: Address;
  siblings: () => Promise<{ siblings: bigint[]; pathIndices: number[] }>; // built right before reveal
}

export interface SlashResult {
  commit: Sent;
  reveal: Sent;
}

/// PRD B1: how a slash reaches the chain. Only commit–reveal exists: BTX is not available (gates.md G1).
export interface SubmitPath {
  readonly name: string;
  slash(req: SlashRequest): Promise<SlashResult>;
}

export function slashCommitment(secret: bigint, receiver: Address, salt: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "bytes32" }], [secret, receiver, salt]));
}

/// PRD B2: commitSlash(H(a0, receiver, salt)) in one block, revealSlash(...) in a later block.
/// The commitment binds the reward to `receiver`, so a leader or RPC operator who copies the reveal gains nothing.
export class CommitRevealPath implements SubmitPath {
  readonly name = "commit-reveal";
  constructor(
    private tx: Broadcaster,
    private registry: Address,
    private pollMs = 400,
  ) {}

  async slash(req: SlashRequest): Promise<SlashResult> {
    const salt = `0x${randomBytes(32).toString("hex")}` as Hex;
    const c = slashCommitment(req.secret, req.receiver, salt);
    const commit = await this.tx.send(this.registry, encodeFunctionData({ abi: registryAbi, functionName: "commitSlash", args: [c] }));
    const committedAt = commit.receipt.blockNumber;
    while ((await this.tx.client.getBlockNumber()) <= committedAt) await new Promise((r) => setTimeout(r, this.pollMs));
    const { siblings, pathIndices } = await req.siblings();
    const reveal = await this.tx.send(
      this.registry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "revealSlash",
        args: [req.secret, req.receiver, salt, siblings, pathIndices],
      }),
    );
    return { commit, reveal };
  }
}
