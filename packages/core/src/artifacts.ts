import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface RlnArtifacts {
  wasm: Uint8Array;
  zkey: Uint8Array;
  vkey: Record<string, unknown>;
}

const DIR = fileURLToPath(new URL("../artifacts/rln-20/", import.meta.url));

/// Must match artifacts/rln-20/SHA256SUMS. Duplicated here so an edited SUMS file cannot bless a swapped artifact.
export const ARTIFACT_SHA256: Record<string, string> = {
  "rln.wasm": "fa9586db68a9566fd9b3af6e8d7c66f5567b35647aa63a426f220375e9fa8c04",
  "rln_final.zkey": "ae30d3d4b29d9dab8c65ff181644a3eb57c2c0fa9f687ea3baf8c7f711d7946a",
  "verification_key.json": "75b035607a8c42fda93f7ce24011a25ac129737aaaa6271d511a98e3dd556964",
};

function readPinned(name: string, dir: string): Buffer {
  const buf = readFileSync(dir + name);
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== ARTIFACT_SHA256[name]) throw new Error(`artifact checksum mismatch: ${name}`);
  return buf;
}

/// Node only. Loads the vendored RLN(20,16) artifacts and checks their SHA-256.
export function loadArtifacts(dir = DIR): RlnArtifacts {
  return {
    wasm: readPinned("rln.wasm", dir),
    zkey: readPinned("rln_final.zkey", dir),
    vkey: JSON.parse(readPinned("verification_key.json", dir).toString("utf8")),
  };
}

/// Verification key only (servers do not need the proving key).
export function loadVerificationKey(dir = DIR): Record<string, unknown> {
  return JSON.parse(readPinned("verification_key.json", dir).toString("utf8"));
}
