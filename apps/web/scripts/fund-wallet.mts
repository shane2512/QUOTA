/// Send test MON from the deployer to an operator wallet (the address the console shows after login).
///   pnpm fund <address> [amountMon]        default 0.8 MON; enough for an agent with limit 3 and its gas
///   pnpm fund <address> --check            only print the balances
/// Testnet only. Safety: at most 1.5 MON per call, the deployer must keep 1 MON afterwards, and the destination must
/// not be the deployer. Needs DEPLOYER_PRIVATE_KEY in .env (never printed).
import { fileURLToPath } from "node:url";
import { createPublicClient, formatEther, getAddress, http, isAddress, parseEther, type Hex } from "viem";
import { Broadcaster, LocalKeyWallet } from "@quota/slasher";
import { monadTestnet } from "../lib/registry.ts";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const [to, amountArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const checkOnly = process.argv.includes("--check");
const MAX = parseEther("1.5");
const KEEP = parseEther("1");

if (!to || !isAddress(to)) {
  console.error("usage: pnpm fund <0xaddress> [amountMon] | pnpm fund <0xaddress> --check");
  process.exit(2);
}
const chain = createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL || undefined) });
const wallet = new LocalKeyWallet(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const dest = getAddress(to);
const show = async (label: string, a: `0x${string}`) => console.log(`${label.padEnd(10)} ${a}  ${formatEther(await chain.getBalance({ address: a }))} MON`);

await show("deployer", wallet.address);
await show("recipient", dest);
if (checkOnly) process.exit(0);

if (dest.toLowerCase() === wallet.address.toLowerCase()) throw new Error("refusing to send to the deployer itself");
const amount = parseEther(amountArg ?? "0.8");
if (amount <= 0n || amount > MAX) throw new Error(`amount must be above 0 and at most ${formatEther(MAX)} MON`);
if ((await chain.getBalance({ address: wallet.address })) - amount < KEEP) throw new Error(`the deployer must keep at least ${formatEther(KEEP)} MON; top it up first`);

const sent = await new Broadcaster(chain, wallet).send(dest, "0x", amount);
// Monad checks balances against lagging state: wait a few blocks so the recipient's first transaction is accepted
const target = sent.receipt.blockNumber + 6n;
while ((await chain.getBlockNumber()) < target) await new Promise((r) => setTimeout(r, 500));
console.log(`sent ${formatEther(amount)} MON: https://testnet.monadvision.com/tx/${sent.hash}`);
await show("recipient", dest);
process.exit(0);
