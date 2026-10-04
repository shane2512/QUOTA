/// Phase 3 exit check, end to end against a live registry (anvil or Monad testnet):
///   fund a fresh operator → register (software) passkey → enroll an agent with a known secret
///   → 3 honest RLN requests verified against the ON-CHAIN root → 4th request reuses a message id
///   → server recovers the secret → slasher commit → reveal → reward lands at the receiver.
/// Env: MONAD_RPC_URL, QUOTA_REGISTRY_ADDRESS, DEPLOYER_PRIVATE_KEY (funds the actors), SLASHER_PRIVATE_KEY,
///      WEBAUTHN_RP_ID, PASSKEY_ORIGIN (default http://localhost:3777).
/// Run: pnpm --filter @quota/slasher phase3   (reads ../../.env)
import { randomBytes } from "node:crypto";
import { createPublicClient, encodeAbiParameters, encodeFunctionData, formatEther, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { QuotaClient } from "@quota/client";
import { MemberState, fetchTree, identityCommitment, loadArtifacts, registryAbi } from "@quota/core";
import { QuotaVerifier, RegistryRootChecker, type Violation } from "@quota/server";
import { Broadcaster, CommitRevealPath, LocalKeyWallet, Slasher, type SlashOutcome, type Sent } from "../src/index.ts";
import { Action, SoftPasskey } from "./soft-passkey.ts";

process.loadEnvFile?.(new URL("../../../.env", import.meta.url).pathname);
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
const RPC = need("MONAD_RPC_URL");
const REGISTRY = need("QUOTA_REGISTRY_ADDRESS") as Address;
const RP_ID = need("WEBAUTHN_RP_ID");
const ORIGIN = process.env.PASSKEY_ORIGIN || "http://localhost:3777";
const LIMIT = 3n;

const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
  return cond;
};
const payload = (i: number) => (`0x${i.toString(16).padStart(64, "0")}`) as Hex;

async function main() {
  let sweep: (() => Promise<void>) | undefined;
  try {
    await run((f) => (sweep = f));
  } finally {
    await sweep?.().catch((e) => console.error("sweep failed:", e instanceof Error ? e.message : e));
  }
}

async function run(onSweep: (f: () => Promise<void>) => void) {
  const client = createPublicClient({ transport: http(RPC) });
  const chainId = await client.getChainId();
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName, args } as never) as Promise<T>;
  const UNIT = await read<bigint>("UNIT");
  const SHARE = await read<bigint>("SLASH_SHARE_BPS");
  console.log(`chain ${chainId}, registry ${REGISTRY}, unit ${formatEther(UNIT)}, slash share ${SHARE} bps`);

  const funder = new Broadcaster(client, new LocalKeyWallet(need("DEPLOYER_PRIVATE_KEY") as Hex));
  const slasherWallet = new LocalKeyWallet(need("SLASHER_PRIVATE_KEY") as Hex);
  const operatorWallet = new LocalKeyWallet(generatePrivateKey()); // fresh, throwaway
  const receiver = privateKeyToAddress(generatePrivateKey()); // fresh address: balance starts at 0
  const operator = new Broadcaster(client, operatorWallet);
  const slasherTx = new Broadcaster(client, slasherWallet);
  const gasLog: string[] = [];
  // Always return the throwaway operator's leftover gas money to the funder, even if a later step fails.
  onSweep(async () => {
    const fees = await client.estimateFeesPerGas();
    const maxFee = fees.maxFeePerGas > 200_000_000_000n ? fees.maxFeePerGas : 200_000_000_000n;
    const left = (await client.getBalance({ address: operatorWallet.address })) - 24_150n * maxFee;
    if (left > 0n) {
      const s = await operator.send(funder.wallet.address, "0x", left);
      console.log(`swept ${formatEther(left)} MON back to the funder: ${s.hash}`);
    }
  });
  const note = (label: string, s: Sent) => {
    gasLog.push(`${label.padEnd(18)} estimate ${s.gasEstimate}  limit ${s.gasLimit}  tx ${s.hash}`);
    return s;
  };

  // ---- fund actors
  const stake = LIMIT * UNIT;
  const opFund = stake + 450_000_000_000_000_000n; // stake + 0.45 for gas (balance check uses limit × maxFee)
  const funded = note("fund operator", await funder.send(operatorWallet.address, "0x", opFund));
  if ((await client.getBalance({ address: slasherWallet.address })) < 200_000_000_000_000_000n) {
    note("fund slasher", await funder.send(slasherWallet.address, "0x", 300_000_000_000_000_000n));
  }

  // Monad checks a sender's balance against state that lags consensus by a few blocks (async execution),
  // so a freshly funded account must wait before it can send.
  while ((await client.getBlockNumber()) < funded.receipt.blockNumber + 4n) await new Promise((r) => setTimeout(r, 400));

  // ---- operator: register passkey, enroll an agent whose secret we hold
  const pk = new SoftPasskey(RP_ID, ORIGIN);
  const opAddr = operatorWallet.address;
  const sign = async (action: number, params: Hex) => {
    const nonce = await read<bigint>("passkeyNonce", [opAddr]);
    return pk.assert(SoftPasskey.challenge(chainId, REGISTRY, opAddr, action, params, nonce));
  };
  const regParams = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [pk.x, pk.y]);
  note(
    "registerPasskey",
    await operator.send(REGISTRY, encodeFunctionData({ abi: registryAbi, functionName: "registerPasskey", args: [pk.x, pk.y, await sign(Action.RegisterPasskey, regParams)] })),
  );

  const secret = BigInt(`0x${randomBytes(31).toString("hex")}`); // never printed
  const id = identityCommitment(secret);
  const enrollParams = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint64" }, { type: "uint256" }, { type: "uint256" }],
    [id, LIMIT, 0n, stake],
  );
  const enrolled = note(
    "enroll",
    await operator.send(
      REGISTRY,
      encodeFunctionData({ abi: registryAbi, functionName: "enroll", args: [id, LIMIT, 0n, await sign(Action.Enroll, enrollParams)] }),
      stake,
    ),
  );
  const member = await read<{ state: number; index: number; stake: bigint }>("members", [id]);
  ok(member.state === MemberState.Active && member.stake === stake, `agent enrolled at index ${member.index}, stake ${formatEther(stake)}`);

  // ---- agent + server against the on-chain root
  const tree = await fetchTree(client, REGISTRY);
  const onchainRoot = await read<bigint>("root");
  ok(tree.root === onchainRoot, `tree from leaves() matches on-chain root (${tree.size} leaves)`);
  const artifacts = loadArtifacts();
  const agent = new QuotaClient({ secret, limit: LIMIT, artifacts, merkleProof: () => tree.proof(member.index), allowOveruse: true });
  ok(agent.leaf === tree.leaf(member.index), "agent leaf = on-chain leaf");

  const outcomes: Promise<SlashOutcome>[] = [];
  const slasher = new Slasher({
    client,
    registry: REGISTRY,
    path: new CommitRevealPath(slasherTx, REGISTRY),
    broadcaster: slasherTx,
    receiver,
  });
  const violations: Violation[] = [];
  const server = new QuotaVerifier({
    serverId: "demo-mcp.quota",
    vkey: artifacts.vkey,
    roots: new RegistryRootChecker(client, REGISTRY),
    onViolation: (v) => {
      violations.push(v);
      outcomes.push(slasher.enqueue(v));
    },
  });

  for (let i = 0; i < Number(LIMIT); i++) {
    const h = await agent.signRequest("demo-mcp.quota", payload(i));
    const r = await server.verifyHeader(h["x-quota-proof"], payload(i));
    ok(r.ok, `honest request ${i + 1}/${LIMIT} verified against on-chain root (isKnownRoot via RPC)`);
  }
  const cheat = await server.verifyHeader((await agent.signRequest("demo-mcp.quota", payload(99)))["x-quota-proof"], payload(99));
  ok(!cheat.ok && cheat.reason === "violation", `request ${LIMIT + 1n} reuses a message id → violation`);
  ok(violations.length === 1 && violations[0].secret === secret, "server recovered the agent secret exactly (not printed)");

  // ---- slash
  const before = await client.getBalance({ address: receiver });
  const outcome = await outcomes[0];
  if (outcome.status !== "slashed") {
    ok(false, `slash outcome: ${JSON.stringify(outcome, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    return;
  }
  note("commitSlash", outcome.result.commit);
  note("revealSlash", outcome.result.reveal);
  const after = await client.getBalance({ address: receiver });
  const reward = (stake * SHARE) / 10_000n;
  ok(
    outcome.result.reveal.receipt.blockNumber > outcome.result.commit.receipt.blockNumber,
    `reveal in block ${outcome.result.reveal.receipt.blockNumber} > commit block ${outcome.result.commit.receipt.blockNumber}`,
  );
  ok(after - before === reward, `receiver got ${formatEther(after - before)} MON = ${SHARE} bps of ${formatEther(stake)}`);
  const m2 = await read<{ state: number; stake: bigint }>("members", [id]);
  ok(m2.state === MemberState.Slashed && m2.stake === 0n, "member state Slashed, stake 0");
  const t2 = await fetchTree(client, REGISTRY);
  ok(t2.leaf(member.index) === 0n && t2.root === (await read<bigint>("root")), "leaf removed; new root matches leaves()");
  ok(outcome.leafRemoved, `leaf removed ${outcome.removal ? "via removeSlashedLeaf " + outcome.removal : "in the reveal"}`);
  const dup = await slasher.enqueue(violations[0]);
  ok(dup.status === "skipped", "second violation for the same secret is not slashed twice");

  console.log(`\noperator ${opAddr}\nslasher  ${slasherWallet.address}\nreceiver ${receiver}\nagent idCommitment ${id}\nenroll block ${enrolled.receipt.blockNumber}`);
  console.log("\ngas (Monad bills the limit):\n" + gasLog.join("\n"));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
  });
