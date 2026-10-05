import { parseAbi, parseAbiItem, type Address, type PublicClient } from "viem";
import { SparseMerkleTree } from "./tree.ts";

export const registryAbi = parseAbi([
  "function root() view returns (uint256)",
  "function depth() view returns (uint256)",
  "function numberOfLeaves() view returns (uint256)",
  "function isKnownRoot(uint256 r) view returns (bool)",
  "function leaves(uint256 from, uint256 count) view returns (uint256[])",
  "function members(uint256 idCommitment) view returns ((address operator, uint8 state, uint64 limit, uint64 unlockAt, uint128 stake, uint32 index, address destination))",
  "function passkeys(address operator) view returns (uint256 x, uint256 y)",
  "function passkeyNonce(address operator) view returns (uint256)",
  "function slashCommitBlock(bytes32 commitment) view returns (uint256)",
  "function pendingRemoval(uint256 idCommitment) view returns (bool)",
  "function totalBurned() view returns (uint256)",
  "function SLASH_SHARE_BPS() view returns (uint256)",
  "function UNIT() view returns (uint256)",
  "function registerPasskey(uint256 x, uint256 y, (bytes authenticatorData, string clientDataJSON, uint256 r, uint256 s) a)",
  "function enroll(uint256 idCommitment, uint64 limit, uint256 treeId, (bytes authenticatorData, string clientDataJSON, uint256 r, uint256 s) a) payable",
  "function topUp(uint256 idCommitment) payable",
  "function changeLimit(uint256 idCommitment, uint64 newLimit, uint256[] siblings, uint8[] path, (bytes authenticatorData, string clientDataJSON, uint256 r, uint256 s) a)",
  "function commitSlash(bytes32 commitment)",
  "function revealSlash(uint256 a0, address receiver, bytes32 salt, uint256[] siblings, uint8[] path)",
  "function removeSlashedLeaf(uint256 idCommitment, uint256[] siblings, uint8[] path)",
  "event LeafSet(uint256 indexed index, uint256 leaf)",
  "event Slashed(uint256 indexed idCommitment, address indexed receiver, uint256 reward, uint256 burned, bool leafRemoved)",
]);

/// Member.state values in QuotaRegistry.
export const MemberState = { None: 0, Active: 1, Unstaking: 2, Withdrawn: 3, Slashed: 4 } as const;

/// Rebuild the tree from the registry's `leaves()` view (a few eth_calls; no event scan).
/// Reads at "latest" and retries until the rebuilt root equals `root()`: Monad executes asynchronously, so a
/// call pinned to the newest block number can see state from before that block's transactions.
export async function fetchTree(
  client: PublicClient,
  registry: Address,
  opts: { page?: bigint; tries?: number } = {},
): Promise<SparseMerkleTree> {
  const page = opts.page ?? 2000n;
  const read = <T>(functionName: "numberOfLeaves" | "depth" | "leaves" | "root", args?: readonly bigint[]) =>
    client.readContract({ address: registry, abi: registryAbi, functionName, args } as never) as Promise<T>;
  const depth = Number(await read<bigint>("depth"));
  for (let attempt = 1; ; attempt++) {
    const n = await read<bigint>("numberOfLeaves");
    const tree = new SparseMerkleTree(depth);
    for (let from = 0n; from < n; from += page) {
      const chunk = await read<readonly bigint[]>("leaves", [from, page]);
      chunk.forEach((leaf, i) => tree.set(Number(from) + i, leaf));
    }
    if (tree.root === (await read<bigint>("root"))) return tree;
    if (attempt >= (opts.tries ?? 10)) throw new Error("registry changed while reading; tree did not converge");
    await new Promise((r) => setTimeout(r, 500));
  }
}

const leafSet = parseAbiItem("event LeafSet(uint256 indexed index, uint256 leaf)");

export interface SyncOptions {
  fromBlock: bigint; // registry deployment block
  toBlock?: bigint; // default: latest
  chunk?: bigint; // Monad testnet RPC caps eth_getLogs at 100 blocks
  concurrency?: number;
}

/// Fallback for registries without `leaves()` (v1). Rebuilds the tree by replaying LeafSet(index, leaf) events in order.
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
