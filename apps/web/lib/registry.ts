import { createPublicClient, defineChain, http, parseAbi } from "viem";

/// Monad testnet and the current QuotaRegistry (v3). All public values; nothing secret lives in the web app.
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
});

export const REGISTRY = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "0xCBdfda8ebF4302793C06a402E9753C4F43799990") as `0x${string}`;
export const EXPLORER = "https://testnet.monadvision.com";

export const registryAbi = parseAbi([
  "function numberOfLeaves() view returns (uint256)",
  "function leaves(uint256 from, uint256 count) view returns (uint256[])",
  "function totalBurned() view returns (uint256)",
  "function UNIT() view returns (uint256)",
  "function SLASH_SHARE_BPS() view returns (uint256)",
  "function UNSTAKE_DELAY() view returns (uint256)",
  "function ROOT_TTL() view returns (uint256)",
  "function root() view returns (uint256)",
  "function depth() view returns (uint256)",
]);

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL || undefined),
});

export const mon = (wei: bigint, dp = 3) => (Number(wei) / 1e18).toFixed(dp);
