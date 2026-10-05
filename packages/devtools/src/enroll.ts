/// TEST TOOLING ONLY: enroll an agent with a scripted operator (software passkey). The operator is a fresh
/// throwaway account, funded by `funder`; its leftover gas money is always swept back.
/// Consequence: nobody holds the operator key or passkey afterwards, so the stake cannot be unstaked. Keep stakes small.
import { encodeAbiParameters, encodeFunctionData, formatEther, type Address, type PublicClient } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { MemberState, registryAbi } from "@quota/core";
import { Broadcaster, LocalKeyWallet, type Sent } from "@quota/slasher";
import { Action, SoftPasskey, defaultOrigin } from "./soft-passkey.ts";

export interface EnrollOptions {
  client: PublicClient;
  registry: Address;
  funder: Broadcaster;
  idCommitment: bigint;
  limit: bigint;
  rpId: string;
  origin?: string; // default: defaultOrigin(rpId)
  gasBudget?: bigint; // operator gas money, default 0.45 MON (balance check uses limit × max fee)
  log?: (line: string) => void;
  /// Use this wallet as the operator (e.g. a Privy agent wallet) instead of a fresh throwaway key. It is funded only
  /// up to `operatorBalance` if below it, and nothing is swept back.
  operator?: Broadcaster;
  operatorBalance?: bigint;
  /// The operator's (software) passkey. If it is already registered for the operator, registration is skipped.
  passkey?: SoftPasskey;
}

export interface EnrollResult {
  operator: Address;
  index: number;
  stake: bigint;
  txs: { label: string; sent: Sent }[];
}

export async function enrollWithSoftPasskey(o: EnrollOptions): Promise<EnrollResult> {
  const log = o.log ?? (() => {});
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    o.client.readContract({ address: o.registry, abi: registryAbi, functionName, args } as never) as Promise<T>;
  const existing = await read<{ state: number; index: number; stake: bigint }>("members", [o.idCommitment]);
  if (existing.state !== MemberState.None) throw new Error(`idCommitment already used (state ${existing.state})`);

  const chainId = await o.client.getChainId();
  const unit = await read<bigint>("UNIT");
  const stake = o.limit * unit;
  const op = o.operator ?? new Broadcaster(o.client, new LocalKeyWallet(generatePrivateKey()));
  const opWallet = op.wallet;
  const txs: EnrollResult["txs"] = [];
  const target = o.operator ? (o.operatorBalance ?? 0n) : stake + (o.gasBudget ?? 450_000_000_000_000_000n);
  const have = await o.client.getBalance({ address: opWallet.address });
  if (have < target) {
    const funded = await o.funder.send(opWallet.address, "0x", target - have);
    txs.push({ label: "fund operator", sent: funded });
    log(`funded operator ${opWallet.address} with ${formatEther(target - have)} MON`);
    // Monad checks balances against lagging state (async execution): wait before the funded account sends.
    while ((await o.client.getBlockNumber()) < funded.receipt.blockNumber + 4n) await new Promise((r) => setTimeout(r, 400));
  }
  try {
    const pk = o.passkey ?? new SoftPasskey(o.rpId, o.origin ?? defaultOrigin(o.rpId));
    const [px, py] = (await read<[bigint, bigint]>("passkeys", [opWallet.address])) as unknown as [bigint, bigint];
    const registered = px !== 0n;
    if (registered && (px !== pk.x || py !== pk.y)) throw new Error("operator has a different passkey registered (pass the matching `passkey`)");
    const sign = async (action: number, params: `0x${string}`) =>
      pk.assert(SoftPasskey.challenge(chainId, o.registry, opWallet.address, action, params, await read<bigint>("passkeyNonce", [opWallet.address])));
    if (!registered) {
      const regParams = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [pk.x, pk.y]);
      txs.push({
        label: "registerPasskey",
        sent: await op.send(o.registry, encodeFunctionData({ abi: registryAbi, functionName: "registerPasskey", args: [pk.x, pk.y, await sign(Action.RegisterPasskey, regParams)] })),
      });
    }
    const enrollParams = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint64" }, { type: "uint256" }, { type: "uint256" }],
      [o.idCommitment, o.limit, 0n, stake],
    );
    txs.push({
      label: "enroll",
      sent: await op.send(
        o.registry,
        encodeFunctionData({ abi: registryAbi, functionName: "enroll", args: [o.idCommitment, o.limit, 0n, await sign(Action.Enroll, enrollParams)] }),
        stake,
      ),
    });
    const m = await read<{ state: number; index: number }>("members", [o.idCommitment]);
    log(`enrolled at index ${m.index}, stake ${formatEther(stake)} MON`);
    return { operator: opWallet.address, index: m.index, stake, txs };
  } finally {
    // Sweep only throwaway operators; a provided operator (e.g. a Privy wallet) keeps its balance.
    if (!o.operator) {
      const fees = await o.client.estimateFeesPerGas();
      const maxFee = fees.maxFeePerGas > 200_000_000_000n ? fees.maxFeePerGas : 200_000_000_000n;
      const left = (await o.client.getBalance({ address: opWallet.address })) - 24_150n * maxFee;
      if (left > 0n) {
        const s = await op.send(o.funder.wallet.address, "0x", left);
        txs.push({ label: "sweep operator", sent: s });
        log(`swept ${formatEther(left)} MON back to the funder`);
      }
    }
  }
}
