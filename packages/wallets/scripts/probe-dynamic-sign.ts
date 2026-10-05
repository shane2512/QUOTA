/// Sign-only test (never broadcast): can the Dynamic server wallet sign with no local key shares?
import { fileURLToPath } from "node:url";
import { dynamicEvmClient } from "../src/dynamic-sdk.ts";
import { parseTransaction, recoverTransactionAddress } from "viem";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const addr = process.argv[2] || "0xb1E9a0311088528F6cD90316a7f3c7E86d43060a";
const dyn = dynamicEvmClient(process.env.DYNAMIC_ENVIRONMENT_ID!);
await dyn.authenticateApiToken(process.env.DYNAMIC_API_TOKEN!);
const w = process.env.DYNAMIC_SLASHER_WALLET
  ? JSON.parse(Buffer.from(process.env.DYNAMIC_SLASHER_WALLET, "base64").toString("utf8"))
  : await dyn.getWalletByAddress(addr);
if (!w) throw new Error("wallet not found");
try {
  const info = await dyn.getWalletExternalServerKeyShareBackupInfo({ walletMetadata: w });
  console.log("backup info:", JSON.stringify(info).slice(0, 400));
} catch (e) {
  console.log("backup info: ERROR", (e as Error).message.slice(0, 200));
}
try {
  const signed = await dyn.signTransaction({
    walletMetadata: w,
    password: process.env.DYNAMIC_WALLET_PASSWORD,
    transaction: { type: "eip1559", chainId: 10143, nonce: 0, to: (w as { accountAddress: string }).accountAddress as `0x${string}`, value: 0n, gas: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
  });
  const from = await recoverTransactionAddress({ serializedTransaction: signed as `0x02${string}` });
  console.log("sign without local shares: OK, signer", from, "type", parseTransaction(signed as `0x02${string}`).type);
} catch (e) {
  console.log("sign without local shares: FAIL", (e as Error).message.slice(0, 300));
}
process.exit(0);
