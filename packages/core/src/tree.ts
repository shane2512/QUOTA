import { poseidon2 } from "poseidon-lite";
import { TREE_DEPTH } from "./hash.ts";

export interface MerkleProof {
  root: bigint;
  leaf: bigint;
  index: number;
  siblings: bigint[]; // level 0 (leaf level) first
  pathIndices: number[]; // bit i of index: 1 = node is the right child at level i
}

/// Sparse fixed-depth binary Merkle tree, zero leaf 0, node = Poseidon(left, right).
/// Same shape as zk-kit InternalBinaryIMT (on-chain) and circom-rln MerkleTreeInclusionProof.
/// Leaves are append-only by index; removal sets a leaf to 0, as the registry does.
export class SparseMerkleTree {
  readonly depth: number;
  readonly zeros: bigint[];
  private readonly levels: Map<number, bigint>[];
  private count = 0;

  constructor(depth = TREE_DEPTH) {
    this.depth = depth;
    this.zeros = [0n];
    for (let i = 0; i < depth; i++) this.zeros.push(poseidon2([this.zeros[i], this.zeros[i]]));
    this.levels = Array.from({ length: depth + 1 }, () => new Map());
  }

  get size(): number {
    return this.count;
  }

  get root(): bigint {
    return this.node(this.depth, 0);
  }

  leaf(index: number): bigint {
    return this.node(0, index);
  }

  indexOf(leaf: bigint): number {
    for (const [i, v] of this.levels[0]) if (v === leaf) return i;
    return -1;
  }

  /// Set leaf `index` (insert when index == size). Mirrors LeafSet(index, leaf) events.
  set(index: number, leaf: bigint): void {
    if (index < 0 || index >= 2 ** this.depth) throw new Error("index out of range");
    if (index > this.count) throw new Error(`gap: set(${index}) with size ${this.count}`);
    if (index === this.count) this.count++;
    let i = index;
    let v = leaf;
    for (let level = 0; level <= this.depth; level++) {
      if (v === this.zeros[level]) this.levels[level].delete(i);
      else this.levels[level].set(i, v);
      if (level === this.depth) break;
      const left = i % 2 === 0 ? v : this.node(level, i - 1);
      const right = i % 2 === 0 ? this.node(level, i + 1) : v;
      v = poseidon2([left, right]);
      i = Math.floor(i / 2);
    }
  }

  insert(leaf: bigint): number {
    const index = this.count;
    this.set(index, leaf);
    return index;
  }

  proof(index: number): MerkleProof {
    if (index < 0 || index >= this.count) throw new Error("no such leaf");
    const siblings: bigint[] = [];
    const pathIndices: number[] = [];
    let i = index;
    for (let level = 0; level < this.depth; level++) {
      pathIndices.push(i % 2);
      siblings.push(this.node(level, i % 2 === 0 ? i + 1 : i - 1));
      i = Math.floor(i / 2);
    }
    return { root: this.root, leaf: this.leaf(index), index, siblings, pathIndices };
  }

  private node(level: number, index: number): bigint {
    return this.levels[level].get(index) ?? this.zeros[level];
  }
}

export function verifyMerkleProof(p: MerkleProof): boolean {
  let v = p.leaf;
  for (let i = 0; i < p.siblings.length; i++) {
    v = p.pathIndices[i] ? poseidon2([p.siblings[i], v]) : poseidon2([v, p.siblings[i]]);
  }
  return v === p.root;
}
