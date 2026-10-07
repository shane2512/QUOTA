// The workspace packages are TypeScript source (no build step), so Next must compile them.
export default {
  reactStrictMode: true,
  transpilePackages: ["@quota/core", "@quota/client", "@quota/slasher", "@quota/wallets"],
};
