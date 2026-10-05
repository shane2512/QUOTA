import {
  MCP_META_KEY,
  PROOF_HEADER,
  encodeProof,
  fetchTree,
  hashToField,
  httpPayloadHash,
  toolPayloadHash,
  type MerkleProof,
  type SparseMerkleTree,
} from "@quota/core";
import type { Address, Hex, PublicClient } from "viem";
import type { QuotaClient } from "./index.ts";

/// Fixed message the agent's wallet signs to derive its RLN secret (PRD W2). Same string as the Privy gate test.
export const SECRET_MESSAGE = "QUOTA/rln-secret/v1";

/// Message for identity number `index`: SECRET_MESSAGE for 0 (backwards compatible), SECRET_MESSAGE + "/n" after.
/// A slashed or withdrawn idCommitment can never re-enroll, so an agent rotates to the next index to stake again;
/// a fresh index is also a fresh, unlinkable identity.
export function secretMessage(index = 0): string {
  if (!Number.isInteger(index) || index < 0) throw new Error("identity index must be a non-negative integer");
  return index === 0 ? SECRET_MESSAGE : `${SECRET_MESSAGE}/${index}`;
}

/// a0 = hashToField(signature over secretMessage(index)). Recoverable from the wallet, never stored.
/// Requires deterministic signatures (RFC 6979; verified for Privy in gates.md G2 and Phase 5).
export async function deriveSecret(signMessage: (message: string) => Promise<Hex>, index = 0): Promise<bigint> {
  const a0 = hashToField(await signMessage(secretMessage(index)));
  if (a0 === 0n) throw new Error("derived secret is zero");
  return a0;
}

/// Merkle proof source for QuotaClient.merkleProof: rebuilds the registry tree via `leaves()` when the cached copy
/// is older than maxAgeMs. Roots stay acceptable for the registry's ROOT_TTL (10 min), so 60 s is safe.
export class RegistryMembership {
  #tree?: SparseMerkleTree;
  #at = 0;
  constructor(
    private client: PublicClient,
    private registry: Address,
    private leaf: bigint,
    private maxAgeMs = 60_000,
  ) {}

  async proof(): Promise<MerkleProof> {
    if (!this.#tree || Date.now() - this.#at > this.maxAgeMs) {
      this.#tree = await fetchTree(this.client, this.registry);
      this.#at = Date.now();
    }
    const index = this.#tree.indexOf(this.leaf);
    if (index < 0) throw new Error("agent is not in the registry tree (not enrolled, removed, or slashed)");
    return this.#tree.proof(index);
  }

  invalidate(): void {
    this.#tree = undefined;
  }
}

/// fetch() that attaches an RLN proof bound to (method, path?query, body). Body must be a string or absent.
export function quotaFetch(quota: QuotaClient, serverId: string, baseFetch: typeof fetch = fetch) {
  return async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    if (init.body !== undefined && init.body !== null && typeof init.body !== "string") {
      throw new Error("quotaFetch: body must be a string (serialize JSON first)");
    }
    const hash = httpPayloadHash(init.method ?? "GET", url.pathname + url.search, init.body ?? "");
    const headers = new Headers(init.headers);
    headers.set(PROOF_HEADER, encodeProof(await quota.prove(serverId, hash)));
    return baseFetch(url, { ...init, headers });
  };
}

/// `_meta` for an MCP tools/call, carrying a proof bound to (tool, arguments).
export async function quotaToolMeta(
  quota: QuotaClient,
  serverId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<Record<string, string>> {
  return { [MCP_META_KEY]: encodeProof(await quota.prove(serverId, toolPayloadHash(tool, args))) };
}
