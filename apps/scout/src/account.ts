import { encodeAbiParameters, encodeFunctionData, type Address, type PublicClient } from "viem";
import { FileUsageStore, QuotaClient, RegistryMembership, quotaToolMeta } from "@quota/client";
import { fetchTree, loadArtifacts, registryAbi, type RlnArtifacts } from "@quota/core";
import { Action, SoftPasskey } from "@quota/devtools";
import type { Broadcaster } from "@quota/slasher";
import type { QuotaAccount } from "./tools.ts";

/// Scout's live staked identity on the registry. The agent wallet (Privy) signs registry transactions; raising the
/// limit also needs the operator's passkey — here the SOFTWARE passkey (test tooling) standing in for the
/// operator's device; in production that step is a passkey prompt to the human operator.
export class LiveQuotaAccount implements QuotaAccount {
  #client!: QuotaClient;
  #membership!: RegistryMembership;
  #limit = 0n;
  readonly #artifacts: Pick<RlnArtifacts, "wasm" | "zkey">;

  constructor(
    private o: {
      chain: PublicClient;
      registry: Address;
      secret: bigint; // never logged
      idCommitment: bigint;
      limit: bigint;
      epochLength: number;
      usagePath: string;
      tx: Broadcaster; // operator = agent wallet (Privy)
      passkey: SoftPasskey;
      allowOveruse?: boolean;
    },
  ) {
    this.#artifacts = loadArtifacts();
    this.#rebuild(o.limit);
  }

  #rebuild(limit: bigint) {
    this.#limit = limit;
    this.#client = new QuotaClient({
      secret: this.o.secret,
      limit,
      artifacts: this.#artifacts,
      merkleProof: () => this.#membership.proof(),
      epochLength: this.o.epochLength,
      allowOveruse: this.o.allowOveruse,
      usage: new FileUsageStore(this.o.usagePath),
    });
    this.#membership = new RegistryMembership(this.o.chain, this.o.registry, this.#client.leaf);
  }

  limit() {
    return this.#limit;
  }
  remaining(serverId: string) {
    return this.#client.remaining(serverId);
  }
  secondsToNextEpoch() {
    const now = Date.now() / 1000;
    return Math.ceil(this.o.epochLength - (now % this.o.epochLength));
  }
  proofMeta(serverId: string, tool: string, args: Record<string, unknown>) {
    return quotaToolMeta(this.#client, serverId, tool, args);
  }

  async #member() {
    return (await this.o.chain.readContract({ address: this.o.registry, abi: registryAbi, functionName: "members", args: [this.o.idCommitment] })) as {
      limit: bigint;
      stake: bigint;
      index: number;
    };
  }

  async stake() {
    const [m, unit] = await Promise.all([
      this.#member(),
      this.o.chain.readContract({ address: this.o.registry, abi: registryAbi, functionName: "UNIT" }) as Promise<bigint>,
    ]);
    return { stakeWei: m.stake, unitWei: unit };
  }

  async raiseLimit(newLimit: bigint) {
    const txs: string[] = [];
    const m = await this.#member();
    const { unitWei } = await this.stake();
    const need = newLimit * unitWei;
    if (m.stake < need) {
      const s = await this.o.tx.send(this.o.registry, encodeFunctionData({ abi: registryAbi, functionName: "topUp", args: [this.o.idCommitment] }), need - m.stake);
      txs.push(s.hash);
    }
    const chainId = await this.o.chain.getChainId();
    const operator = this.o.tx.wallet.address;
    const nonce = (await this.o.chain.readContract({ address: this.o.registry, abi: registryAbi, functionName: "passkeyNonce", args: [operator] })) as bigint;
    const params = encodeAbiParameters([{ type: "uint256" }, { type: "uint64" }], [this.o.idCommitment, newLimit]);
    const assertion = this.o.passkey.assert(SoftPasskey.challenge(chainId, this.o.registry, operator, Action.ChangeLimit, params, nonce));
    const p = (await fetchTree(this.o.chain, this.o.registry)).proof(m.index);
    const s = await this.o.tx.send(
      this.o.registry,
      encodeFunctionData({ abi: registryAbi, functionName: "changeLimit", args: [this.o.idCommitment, newLimit, p.siblings, p.pathIndices, assertion] }),
    );
    txs.push(s.hash);
    this.#rebuild(newLimit); // the leaf is Poseidon(id, limit): new limit, new leaf; used message ids carry over
    return { limit: newLimit, txs };
  }
}
