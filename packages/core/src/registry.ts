import { parseAbi, parseAbiItem, type Address, type PublicClient } from "viem";
import { SparseMerkleTree } from "./tree.ts";

export const registryAbi = parseAbi([
  "function root() view returns (uint256)",
  "function depth() view returns (uint256)",
  "function numberOfLeaves() view returns (uint256)",
  "function isKnownRoot(uint256 r) view returns (bool)",
  "event LeafSet(uint256 indexed index, uint256 leaf)",
]);

const leafSet = parseAbiItem("event LeafSet(uint256 indexed index, uint256 leaf)");

export interface SyncOptions {
  fromBlock: bigint; // registry deployment block
  toBlock?: bigint; // default: latest
  chunk?: bigint; // Monad testnet RPC caps eth_getLogs at 100 blocks
  concurrency?: number;
}

/// Rebuild the registry tree off-chain by replaying LeafSet(index, leaf) events in order.
export async function syncTree(
  client: PublicClient,
  registry: Address,
  opts: SyncOptions,
  tree = new SparseMerkleTree(),
): Promise<{ tree: SparseMerkleTree; toBlock: bigint }> {
  const toBlock = opts.toBlock ?? (await client.getBlockNumber());
  const chunk = opts.chunk ?? 100n;
  const ranges: [bigint, bigint][] = [];
  for (let b = opts.fromBlock; b <= toBlock; b += chunk) {
    ranges.push([b, b + chunk - 1n < toBlock ? b + chunk - 1n : toBlock]);
  }
  const results: { block: bigint; logIndex: number; index: bigint; leaf: bigint }[][] = new Array(ranges.length);
  let next = 0;
  const worker = async () => {
    while (next < ranges.length) {
      const i = next++;
      const [fromBlock, to] = ranges[i];
      const logs = await withRetry(() =>
        client.getLogs({ address: registry, event: leafSet, fromBlock, toBlock: to }),
      );
      results[i] = logs.map((l) => ({
        block: l.blockNumber!,
        logIndex: l.logIndex!,
        index: l.args.index!,
        leaf: l.args.leaf!,
      }));
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 8 }, worker));
  const events = results.flat().sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));
  for (const e of events) tree.set(Number(e.index), e.leaf);
  return { tree, toBlock };
}

async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 300 * 2 ** i));
    }
  }
}
