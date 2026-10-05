/// TEST TOOLING: the software passkey that stands in for the operator's device. A registered passkey cannot be
/// replaced, so it is persisted in .env (DEMO_OPERATOR_PASSKEY, or DEV_OPERATOR_PASSKEY for anvil) on first use.
import { appendFileSync } from "node:fs";
import { SoftPasskey, defaultOrigin } from "@quota/devtools";

export function operatorPasskey(envPath: string, rpId: string, dev: boolean): SoftPasskey {
  const name = dev ? "DEV_OPERATOR_PASSKEY" : "DEMO_OPERATOR_PASSKEY";
  const saved = process.env[name];
  if (saved) return new SoftPasskey(rpId, defaultOrigin(rpId), saved);
  const pk = new SoftPasskey(rpId, defaultOrigin(rpId));
  appendFileSync(envPath, `\n# TEST TOOLING: software passkey standing in for the operator's device (P-256 PKCS8, base64)\n${name}=${pk.exportPkcs8()}\n`);
  process.env[name] = pk.exportPkcs8();
  console.log(`created a software operator passkey and saved it as ${name} in .env`);
  return pk;
}
