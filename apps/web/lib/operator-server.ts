import { PrivyClient } from "@privy-io/node";
import { createPublicClient, decodeErrorResult, encodeFunctionData, getAddress, http, isAddress, isHex, type Address, type Hex } from "viem";
import { MemberState, fetchTree, identityCommitment, registryAbi } from "@quota/core";
import { deriveSecret } from "@quota/client/helpers";
import { Broadcaster } from "@quota/slasher";
import { PrivyAgentWallet } from "@quota/wallets/privy";
import { monadTestnet, REGISTRY } from "./registry";

/// Server side of the operator console (PRD D4, W1, W2).
///   - The browser logs in with Privy; every call here proves it with the Privy access token.
///   - Each user gets ONE agent wallet: a Privy server wallet owned by that user, with our runtime key as an
///     additional signer under the registry-only override policy (see @quota/wallets agentPolicyRules).
///   - Agent secrets are derived from that wallet's signature (never stored, never returned). Only the public
///     identity commitments leave this module.
///   - Custody actions (register passkey, enroll, unstake) need a WebAuthn assertion produced in the browser; the
///     contract rejects them without a valid one, so the runtime key alone cannot move a stake.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new HttpError(503, `operator console is not configured on this deployment (missing ${k})`);
  return v;
};

const g = globalThis as unknown as { __quotaPrivy?: PrivyClient; __quotaIds?: Map<string, bigint>; __quotaLast?: Map<string, number> };
const privy = () => (g.__quotaPrivy ??= new PrivyClient({ appId: need("PRIVY_APP_ID"), appSecret: need("PRIVY_APP_SECRET") }));
const chain = createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL || undefined) });

export const IDENTITY_SLOTS = 6; // identities 0..5 are shown; a slashed identity can never re-enroll, so we need spares
const MAX_LIMIT = BigInt(process.env.OPERATOR_MAX_LIMIT || 20); // per-agent messages/epoch the console will enroll
const MAX_TOPUP_WEI = 10n ** 18n; // matches the wallet policy's value cap
const MIN_GAP_MS = 2500; // per-user spacing between relayed transactions

/// Verify the Privy access token from `Authorization: Bearer …` and return the Privy user id.
export async function authenticate(req: Request): Promise<string> {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new HttpError(401, "log in first");
  try {
    return (await privy().utils().auth().verifyAccessToken(m[1])).user_id;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, "invalid or expired session; log in again");
  }
}

const externalId = (userId: string) => `quota-${userId.replace(/^did:privy:/, "")}`.slice(0, 60);

/// The user's agent wallet, created on first use.
export async function walletFor(userId: string): Promise<PrivyAgentWallet> {
  const key = need("PRIVY_AUTH_PRIVATE_KEY");
  const find = async () => (await privy().wallets().list({ external_id: externalId(userId), chain_type: "ethereum" } as never)).data?.[0];
  let w = await find();
  if (!w) {
    try {
      w = (await privy().wallets().create({
        chain_type: "ethereum",
        display_name: "QUOTA operator wallet",
        external_id: externalId(userId),
        owner: { user_id: userId },
        additional_signers: [{ signer_id: need("PRIVY_AUTH_KEY_QUORUM_ID"), override_policy_ids: [need("PRIVY_AGENT_POLICY_ID")] }],
      } as never)) as never;
    } catch (e) {
      w = await find(); // a concurrent request may have created it
      if (!w) throw e;
    }
  }
  return new PrivyAgentWallet(privy(), w!.id, w!.address as Address, key);
}

/// Public identity commitment of identity n (derived from the wallet's signature; the secret is dropped at once).
async function commitment(w: PrivyAgentWallet, n: number): Promise<bigint> {
  const cache = (g.__quotaIds ??= new Map());
  const k = `${w.walletId}:${n}`;
  let id = cache.get(k);
  if (id === undefined) {
    id = identityCommitment(await deriveSecret((m) => w.signMessage(m), n));
    cache.set(k, id);
  }
  return id;
}

const readRegistry = <T>(functionName: string, args: readonly unknown[] = []) =>
  chain.readContract({ address: REGISTRY, abi: registryAbi, functionName, args } as never) as Promise<T>;

interface Member {
  operator: Address;
  state: number;
  limit: bigint;
  unlockAt: bigint;
  stake: bigint;
  index: number;
  destination: Address;
}

export async function operatorState(userId: string) {
  const w = await walletFor(userId);
  const [balance, unit, delay, nonce, pk, block] = await Promise.all([
    chain.getBalance({ address: w.address }),
    readRegistry<bigint>("UNIT"),
    readRegistry<bigint>("UNSTAKE_DELAY"),
    readRegistry<bigint>("passkeyNonce", [w.address]),
    readRegistry<readonly [bigint, bigint]>("passkeys", [w.address]),
    chain.getBlock(),
  ]);
  const ids = await Promise.all(Array.from({ length: IDENTITY_SLOTS }, (_, n) => commitment(w, n)));
  const members = await Promise.all(ids.map((id) => readRegistry<Member>("members", [id])));
  return {
    operator: w.address,
    chainId: chain.chain!.id,
    registry: REGISTRY,
    balanceWei: balance.toString(),
    unitWei: unit.toString(),
    unstakeDelay: Number(delay),
    maxLimit: Number(MAX_LIMIT),
    now: Number(block.timestamp),
    passkey: { registered: pk[0] !== 0n, x: pk[0].toString(), y: pk[1].toString(), nonce: nonce.toString() },
    agents: members.map((m, n) => ({
      identity: n,
      idCommitment: ids[n].toString(),
      state: m.state,
      mine: m.state === MemberState.None || m.operator.toLowerCase() === w.address.toLowerCase(),
      limit: Number(m.limit),
      stakeWei: m.stake.toString(),
      unlockAt: Number(m.unlockAt),
      destination: m.destination,
    })),
  };
}

// ---------------------------------------------------------------- relay

export interface WireAssertion {
  authenticatorData: Hex;
  clientDataJSON: string;
  r: string;
  s: string;
}

function parseAssertion(a: unknown): { authenticatorData: Hex; clientDataJSON: string; r: bigint; s: bigint } {
  const x = a as Partial<WireAssertion> | undefined;
  if (!x || typeof x.authenticatorData !== "string" || !isHex(x.authenticatorData) || x.authenticatorData.length > 4000) throw new HttpError(400, "bad passkey assertion");
  if (typeof x.clientDataJSON !== "string" || x.clientDataJSON.length > 4000) throw new HttpError(400, "bad passkey assertion");
  try {
    return { authenticatorData: x.authenticatorData, clientDataJSON: x.clientDataJSON, r: BigInt(x.r as string), s: BigInt(x.s as string) };
  } catch {
    throw new HttpError(400, "bad passkey assertion");
  }
}

const uint = (v: unknown, what: string) => {
  try {
    const b = BigInt(v as string);
    if (b < 0n) throw 0;
    return b;
  } catch {
    throw new HttpError(400, `bad ${what}`);
  }
};
const slot = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n >= IDENTITY_SLOTS) throw new HttpError(400, "bad identity");
  return n;
};

/// The registry's custom error name, if the failed call carried revert data (it sits somewhere in viem's cause chain).
function revertName(e: unknown): string | undefined {
  for (let c = e as { data?: unknown; cause?: unknown } | undefined, i = 0; c && i < 8; c = c.cause as typeof c, i++) {
    if (typeof c.data === "string" && isHex(c.data) && c.data.length >= 10) {
      try {
        return decodeErrorResult({ abi: registryAbi, data: c.data }).errorName;
      } catch {
        // not one of our errors; keep walking
      }
    }
  }
  return undefined;
}

const WHY: Record<string, string> = {
  ChallengeMismatch: "the passkey signature does not match this action (stale or for different details); try again",
  NoPasskey: "register a passkey first",
  PasskeyAlreadyRegistered: "a passkey is already registered for this wallet",
  OriginNotAllowed: "passkeys only work on the site the registry was deployed for",
  RpIdMismatch: "passkeys only work on the site the registry was deployed for",
  StakeTooLow: "the stake is too low for that limit",
  AlreadyEnrolled: "this identity is already enrolled; choose another",
  StillLocked: "the unstake delay has not passed yet",
  NotActive: "this agent is not active",
  NotUnstaking: "no unstake is pending for this agent",
  UserNotVerified: "the passkey did not verify you (user verification is required)",
  UserNotPresent: "the passkey did not confirm presence",
};

function friendly(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  const name = revertName(e);
  if (name) return new HttpError(422, `the registry rejected this: ${name}${WHY[name] ? ` (${WHY[name]})` : ""}`);
  const msg = e instanceof Error ? e.message : String(e);
  if (/insufficient funds|exceeds the balance|insufficient balance/i.test(msg)) return new HttpError(402, "this wallet needs more MON for the stake and gas");
  return new HttpError(502, "the transaction could not be sent; try again");
}

export type RelayBody = { action: string; identity?: unknown; limit?: unknown; x?: unknown; y?: unknown; amountWei?: unknown; destination?: unknown; assertion?: unknown };

/// Build, sign (Privy) and broadcast one registry call for the user's wallet.
export async function relay(userId: string, body: RelayBody) {
  const last = (g.__quotaLast ??= new Map());
  if (Date.now() - (last.get(userId) ?? 0) < MIN_GAP_MS) throw new HttpError(429, "slow down; one transaction at a time");
  last.set(userId, Date.now());

  const w = await walletFor(userId);
  const tx = new Broadcaster(chain, w, { maxFeePerGas: BigInt(process.env.QUOTA_MAX_FEE_GWEI || 120) * 10n ** 9n });
  const send = async (data: Hex, value = 0n) => {
    try {
      const s = await tx.send(REGISTRY, data, value);
      return { hash: s.hash, block: s.receipt.blockNumber.toString() };
    } catch (e) {
      throw friendly(e);
    }
  };
  const member = async (n: number) => {
    const id = await commitment(w, n);
    return { id, m: await readRegistry<Member>("members", [id]) };
  };

  switch (body.action) {
    case "registerPasskey": {
      return send(encodeFunctionData({ abi: registryAbi, functionName: "registerPasskey", args: [uint(body.x, "key"), uint(body.y, "key"), parseAssertion(body.assertion)] }));
    }
    case "enroll": {
      const { id, m } = await member(slot(body.identity));
      if (m.state !== MemberState.None) throw new HttpError(409, "this identity is already enrolled; choose another");
      const limit = uint(body.limit, "limit");
      if (limit < 1n || limit > MAX_LIMIT) throw new HttpError(400, `limit must be 1 to ${MAX_LIMIT}`);
      const unit = await readRegistry<bigint>("UNIT");
      return send(encodeFunctionData({ abi: registryAbi, functionName: "enroll", args: [id, limit, 0n, parseAssertion(body.assertion)] }), limit * unit);
    }
    case "topUp": {
      const { id, m } = await member(slot(body.identity));
      if (m.state !== MemberState.Active || m.operator.toLowerCase() !== w.address.toLowerCase()) throw new HttpError(409, "this agent is not active");
      const amount = uint(body.amountWei, "amount");
      if (amount < 1n || amount > MAX_TOPUP_WEI) throw new HttpError(400, "amount must be above 0 and at most 1 MON");
      return send(encodeFunctionData({ abi: registryAbi, functionName: "topUp", args: [id] }), amount);
    }
    case "requestUnstake": {
      const { id, m } = await member(slot(body.identity));
      if (m.state !== MemberState.Active || m.operator.toLowerCase() !== w.address.toLowerCase()) throw new HttpError(409, "this agent is not active");
      if (typeof body.destination !== "string" || !isAddress(body.destination)) throw new HttpError(400, "bad destination address");
      const proof = (await fetchTree(chain, REGISTRY)).proof(m.index);
      return send(
        encodeFunctionData({
          abi: registryAbi,
          functionName: "requestUnstake",
          args: [id, getAddress(body.destination), proof.siblings, proof.pathIndices, parseAssertion(body.assertion)],
        }),
      );
    }
    case "unstake": {
      const { id, m } = await member(slot(body.identity));
      if (m.state !== MemberState.Unstaking) throw new HttpError(409, "no unstake is pending for this agent");
      if (BigInt((await chain.getBlock()).timestamp) < m.unlockAt) throw new HttpError(409, "the unstake delay has not passed yet");
      return send(encodeFunctionData({ abi: registryAbi, functionName: "unstake", args: [id] }));
    }
    default:
      throw new HttpError(400, "unknown action");
  }
}

/// Wrap a route handler: HttpError → JSON { error } with its status; anything else → generic 500 (no internals leaked).
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return new Response(JSON.stringify(await fn()), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, "server error");
    return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
}
