import { REGISTRY, publicClient, registryAbi } from "@/lib/registry";

/// Live data for the service console: registry state read from Monad testnet, plus the demo server's own
/// request feed when FEED_URL is set (server-side, so an http:// demo server works behind this https site).
/// Everything returned is public: counts, short nullifiers, statuses, tx hashes.

type Snapshot = { at: number; body: unknown };
let cache: Snapshot | undefined;
const TTL_MS = 3000; // many viewers, one RPC read per few seconds

async function chain() {
  const read = <T,>(functionName: string, args: readonly unknown[] = []) =>
    publicClient.readContract({ address: REGISTRY, abi: registryAbi, functionName, args } as never) as Promise<T>;
  const [block, balance, n, burned, unit, shareBps, depth] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.getBalance({ address: REGISTRY }),
    read<bigint>("numberOfLeaves"),
    read<bigint>("totalBurned"),
    read<bigint>("UNIT"),
    read<bigint>("SLASH_SHARE_BPS"),
    read<bigint>("depth"),
  ]);
  const count = n > 256n ? 256n : n; // bounded read; the demo tree is small
  const leaves = count > 0n ? await read<bigint[]>("leaves", [0n, count]) : [];
  const active = leaves.filter((l) => l !== 0n).length;
  return {
    registry: REGISTRY,
    block: block.toString(),
    leavesTotal: Number(n),
    leavesActive: active,
    leavesRemoved: Number(n) - active,
    balanceWei: balance.toString(),
    burnedWei: burned.toString(),
    unitWei: unit.toString(),
    shareBps: Number(shareBps),
    depth: Number(depth),
  };
}

async function feed() {
  const url = process.env.FEED_URL;
  if (!url) return { feed: null, feedError: "FEED_URL is not set on this deployment" };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { feed: await r.json(), feedError: null };
  } catch (e) {
    return { feed: null, feedError: `demo server unreachable (${e instanceof Error ? e.message : "error"})` };
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return Response.json(cache.body);
  const [c, f] = await Promise.allSettled([chain(), feed()]);
  const body = {
    at: Date.now(),
    chain: c.status === "fulfilled" ? c.value : null,
    chainError: c.status === "rejected" ? "could not read Monad testnet" : null,
    ...(f.status === "fulfilled" ? f.value : { feed: null, feedError: "feed failed" }),
  };
  if (body.chain) cache = { at: Date.now(), body };
  return Response.json(body);
}
