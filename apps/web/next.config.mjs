import { existsSync } from "node:fs";

// Local dev reads the monorepo's root .env (deploys set env in the host instead). Existing vars win.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Browser code gets the shared public values under its own names. Only public values here: never the RPC URL (it can carry a key).
const pub = {
  NEXT_PUBLIC_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || process.env.QUOTA_REGISTRY_ADDRESS,
  NEXT_PUBLIC_RP_ID: process.env.NEXT_PUBLIC_RP_ID || process.env.WEBAUTHN_RP_ID,
};

// The workspace packages are TypeScript source (no build step), so Next must compile them.
export default {
  reactStrictMode: true,
  // versioned earth textures never change in place: let browsers and Vercel's edge keep them for a year
  headers: async () => [{ source: "/earth/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }],
  env: Object.fromEntries(Object.entries(pub).filter(([, v]) => v)),
  transpilePackages: ["@quota/core", "@quota/client", "@quota/slasher", "@quota/wallets"],
};
