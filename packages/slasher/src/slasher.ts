import { encodeFunctionData, type Address, type Hex, type PublicClient } from "viem";
import { MemberState, fetchTree, identityCommitment, registryAbi } from "@quota/core";
import type { Broadcaster, SlashResult, SubmitPath } from "./submit.ts";

/// What the slasher needs from a server-side violation (structurally a @quota/server Violation).
export interface SlashableViolation {
  secret: bigint;
  idCommitment: bigint;
}

export type SlashOutcome =
  | { status: "slashed"; idCommitment: bigint; result: SlashResult; leafRemoved: boolean; removal?: Hex }
  | { status: "skipped"; idCommitment: bigint; reason: "duplicate" | "not-member" | "not-slashable" }
  | { status: "failed"; idCommitment: bigint; error: string };

export interface SlasherOptions {
  client: PublicClient;
  registry: Address;
  path: SubmitPath;
  /// Used for removeSlashedLeaf when the tree moved between building siblings and the reveal.
  broadcaster: Broadcaster;
  receiver: Address;
  onOutcome?: (o: SlashOutcome) => void;
}

/// PRD S3: violation → queue → commit → reveal. One slash per secret, processed one at a time.
export class Slasher {
  #seen = new Set<bigint>();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(private o: SlasherOptions) {}

  /// Hook for QuotaVerifier.onViolation. Returns the outcome once this slash has been processed.
  enqueue(v: SlashableViolation): Promise<SlashOutcome> {
    const id = v.idCommitment;
    if (identityCommitment(v.secret) !== id) {
      return Promise.resolve({ status: "failed", idCommitment: id, error: "secret does not match idCommitment" });
    }
    if (this.#seen.has(id)) return Promise.resolve(this.#report({ status: "skipped", idCommitment: id, reason: "duplicate" }));
    this.#seen.add(id);
    const run = this.#queue.then(() => this.#slash(v));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #slash(v: SlashableViolation): Promise<SlashOutcome> {
    const id = v.idCommitment;
    try {
      const m = await this.#member(id);
      if (m.state === MemberState.None) return this.#report({ status: "skipped", idCommitment: id, reason: "not-member" });
      if (m.state !== MemberState.Active && m.state !== MemberState.Unstaking) {
        return this.#report({ status: "skipped", idCommitment: id, reason: "not-slashable" });
      }
      const result = await this.o.path.slash({
        secret: v.secret,
        receiver: this.o.receiver,
        siblings: async () => {
          const tree = await fetchTree(this.o.client, this.o.registry);
          if (m.state !== MemberState.Active) return { siblings: [], pathIndices: [] }; // leaf already removed
          const p = tree.proof(m.index);
          return { siblings: p.siblings, pathIndices: p.pathIndices };
        },
      });
      let removal: Hex | undefined;
      let leafRemoved = m.state !== MemberState.Active;
      if (!leafRemoved) {
        const pending = await this.o.client.readContract({
          address: this.o.registry,
          abi: registryAbi,
          functionName: "pendingRemoval",
          args: [id],
        });
        if (pending) {
          const p = (await fetchTree(this.o.client, this.o.registry)).proof(m.index);
          removal = (
            await this.o.broadcaster.send(
              this.o.registry,
              encodeFunctionData({ abi: registryAbi, functionName: "removeSlashedLeaf", args: [id, p.siblings, p.pathIndices] }),
            )
          ).hash;
        }
        leafRemoved = true;
      }
      return this.#report({ status: "slashed", idCommitment: id, result, leafRemoved, removal });
    } catch (e) {
      this.#seen.delete(id); // allow a retry
      return this.#report({ status: "failed", idCommitment: id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async #member(id: bigint) {
    const m = await this.o.client.readContract({ address: this.o.registry, abi: registryAbi, functionName: "members", args: [id] });
    return { state: m.state, index: m.index, limit: m.limit };
  }

  #report(o: SlashOutcome): SlashOutcome {
    this.o.onOutcome?.(o);
    return o;
  }
}
