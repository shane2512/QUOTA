/// Create the service-side (slasher) Dynamic server wallet, key shares backed up to Dynamic.
/// We keep only walletMetadata (needed to sign later); the returned key shares are dropped, never written.
/// Writes DYNAMIC_WALLET_PASSWORD (if missing) and DYNAMIC_SLASHER_WALLET (base64 JSON metadata) to ../../.env. Prints the address and metadata field names only.
import { fileURLToPath } from "node:url";
import { appendFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dynamicEvmClient } from "../src/dynamic-sdk.ts";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
process.loadEnvFile(envPath);
if (/^DYNAMIC_SLASHER_WALLET=./m.test(readFileSync(envPath, "utf8"))) throw new Error("DYNAMIC_SLASHER_WALLET already set");
const dyn = await dynamicEvmClient(process.env.DYNAMIC_ENVIRONMENT_ID!);
await dyn.authenticateApiToken(process.env.DYNAMIC_API_TOKEN!);
// Dynamic encrypts the backed-up share with this password; it is required to sign later. Generated, never printed.
let password = process.env.DYNAMIC_WALLET_PASSWORD;
if (!password) {
  password = randomBytes(24).toString("base64url");
  appendFileSync(envPath, `\n# Phase 5: encrypts the Dynamic wallet's backed-up key share (needed to sign)\nDYNAMIC_WALLET_PASSWORD=${password}\n`);
}
const r = await dyn.createWalletAccount({ thresholdSignatureScheme: "TWO_OF_TWO", backUpToDynamic: true, password });
const meta = r.walletMetadata;
console.log("address:", (meta as any).accountAddress);
console.log("metadata fields:", Object.keys(meta).join(", "));
console.log("backup statuses:", r.externalKeySharesWithBackupStatus.map((s: { backedUpToClientKeyShareService: boolean }) => s.backedUpToClientKeyShareService));
appendFileSync(envPath, `\n# Phase 5: Dynamic server wallet for the slasher (metadata only; key shares backed up to Dynamic)\nDYNAMIC_SLASHER_WALLET=${Buffer.from(JSON.stringify(meta)).toString("base64")}\n`);
console.log("wrote DYNAMIC_SLASHER_WALLET to .env");
process.exit(0);
