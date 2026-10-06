import type { TransactionSerializable } from "viem";

/// @dynamic-labs-wallet/node-evm 1.1.28 ships `index.esm.d.ts` with `export * from "./src/index"` (no extension),
/// which TypeScript's NodeNext resolution cannot follow, so the class is invisible to the type checker although it
/// exists at runtime. This is the narrow surface we use, typed locally.
export interface DynamicEvmClient {
  authenticateApiToken(token: string): Promise<unknown>;
  createWalletAccount(o: { thresholdSignatureScheme: "TWO_OF_TWO"; backUpToDynamic: boolean; password: string }): Promise<{
    walletMetadata: Record<string, unknown>;
    externalKeySharesWithBackupStatus: { backedUpToClientKeyShareService: boolean }[];
  }>;
  getWalletByAddress(address: string): Promise<Record<string, unknown> | null>;
  getWalletExternalServerKeyShareBackupInfo(o: { walletMetadata: Record<string, unknown> }): Promise<unknown>;
  signTransaction(o: { walletMetadata: Record<string, unknown>; transaction: TransactionSerializable; password?: string }): Promise<string>;
}

/// `enableMPCAccelerator: false`: the accelerated ("forward MPC") signing path timed out after 300 s in our first
/// Phase 5 run (FORWARD_MPC_TIMEOUT, shouldFallback: true, but no fallback happened). The standard path is used.
/// The SDK is imported lazily: its native MPC module throws at load time on Windows ("Neon: unsupported system:
/// win32"), and a static import would make importing @quota/wallets itself (and its Privy-only tests) fail there.
export async function dynamicEvmClient(environmentId: string, o: { enableMPCAccelerator?: boolean } = {}): Promise<DynamicEvmClient> {
  const sdk = await import("@dynamic-labs-wallet/node-evm");
  const Ctor = (sdk as unknown as { DynamicEvmWalletClient: new (o: { environmentId: string; enableMPCAccelerator?: boolean }) => DynamicEvmClient })
    .DynamicEvmWalletClient;
  return new Ctor({ environmentId, enableMPCAccelerator: o.enableMPCAccelerator ?? false });
}
