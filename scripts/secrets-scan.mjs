// Pre-submission secrets scan:  pnpm scan:secrets
//  1. .env must not be tracked, and only .env.example may be.
//  2. Secret-looking values from your local .env must not appear anywhere in the working tree or ANY commit.
//  3. Known credential shapes (Privy "wallet-auth:" keys, Dynamic "dyn_" tokens, private keys assigned to *KEY names)
//     must not appear in any commit.
// Prints only names and locations, never a value. Exit code 1 on any finding.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const git = (args, opts = {}) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"], ...opts });
  } catch (e) {
    if (e.status === 1) return ""; // git grep: no match
    throw e;
  }
};
let findings = 0;
const fail = (msg) => {
  console.log(`FAIL  ${msg}`);
  findings++;
};
const pass = (msg) => console.log(`PASS  ${msg}`);

// 1. tracked env files
const envFiles = git(["ls-files"]).split("\n").filter((f) => /(^|\/)\.env/.test(f) && !f.endsWith(".env.example"));
envFiles.length ? fail(`tracked env file(s): ${envFiles.join(", ")}`) : pass("no .env file is tracked (only .env.example)");

// 2. local .env values
const SECRET_NAME = /(SECRET|PRIVATE_KEY|API_TOKEN|API_KEY|PASSWORD|PASSKEY|AUTH_PRIVATE)/;
const revs = git(["rev-list", "--all"]).split("\n").filter(Boolean);
let checked = 0;
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m || !SECRET_NAME.test(m[1])) continue;
    const value = m[2].split(/\s+#/)[0].trim().replace(/^["']|["']$/g, "");
    if (value.length < 12) continue;
    checked++;
    // tracked + untracked-but-not-ignored files: exactly what a commit could pick up (and fast, unlike --no-index)
    const inTree = git(["grep", "-lIF", "--untracked", "--", value]).split("\n").filter(Boolean);
    const inHistory = revs.length ? git(["grep", "-lIF", "--", value, ...revs]).split("\n").filter(Boolean).map((l) => l.split(":").slice(1).join(":")) : [];
    if (inTree.length) fail(`value of ${m[1]} appears in files that could be committed: ${[...new Set(inTree)].slice(0, 5).join(", ")}`);
    if (inHistory.length) fail(`value of ${m[1]} appears in git history: ${[...new Set(inHistory)].slice(0, 5).join(", ")}`);
  }
  pass(`checked ${checked} secret value(s) from .env against the working tree and ${revs.length} commits`);
} else {
  console.log("SKIP  no local .env, so the value check was not run");
}

// 3. credential shapes in history
const SHAPES = [
  ["Privy authorization key", "wallet-auth:[A-Za-z0-9+/=]{40,}"],
  ["Dynamic API token", "dyn_[A-Za-z0-9]{30,}"],
  ["private key assigned to a *KEY name", "[A-Z_]*(PRIVATE_KEY|SECRET_KEY)[A-Z_]*[ =:\"']+0x[0-9a-fA-F]{64}"],
];
for (const [label, re] of SHAPES) {
  const hits = revs.length ? git(["grep", "-lIE", re, ...revs]).split("\n").filter(Boolean).map((l) => l.split(":").slice(1).join(":")) : [];
  hits.length ? fail(`${label} found in: ${[...new Set(hits)].slice(0, 5).join(", ")}`) : pass(`no ${label} in any commit`);
}

console.log(findings === 0 ? "\nALL CLEAR" : `\n${findings} finding(s): rotate the credential, then remove it from history before submitting`);
process.exit(findings === 0 ? 0 : 1);
