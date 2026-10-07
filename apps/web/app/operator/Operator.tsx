"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { parseEther, type Address } from "viem";
import { Action, challenge, enrollParams, registerParams, unstakeParams } from "@/lib/passkey-core";
import { createPasskey, loadPasskey, savePasskey, signChallenge, supported } from "@/lib/passkey-browser";
import { EXPLORER, mon } from "@/lib/registry";

const RP_ID = process.env.NEXT_PUBLIC_RP_ID || "quota-metro.vercel.app";
const GAS_BUDGET_WEI = 450_000_000_000_000_000n; // ~0.45 MON of gas headroom per enrollment (Monad bills the gas limit)

type Agent = { identity: number; idCommitment: string; state: number; mine: boolean; limit: number; stakeWei: string; unlockAt: number; destination: string };
type Me = {
  operator: Address; chainId: number; registry: Address; balanceWei: string; unitWei: string; unstakeDelay: number; maxLimit: number; now: number;
  passkey: { registered: boolean; x: string; y: string; nonce: string };
  agents: Agent[];
};
const STATE = ["free", "active", "unstaking", "withdrawn", "slashed"] as const;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Operator() {
  const { ready, authenticated, login, logout, user, getAccessToken } = usePrivy();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ label: string; hash: string } | null>(null);
  const [limit, setLimit] = useState(1);
  const [dest, setDest] = useState("");
  const [copied, setCopied] = useState(false);

  const api = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const token = await getAccessToken();
      if (!token) throw new Error("your session expired; log in again");
      const r = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error || `request failed (${r.status})`);
      return j as T;
    },
    [getAccessToken],
  );

  const refresh = useCallback(async () => {
    const m = await api<Me>("/api/operator/me");
    setMe(m);
    setDest((d) => d || m.operator);
    return m;
  }, [api]);

  useEffect(() => {
    if (!ready || !authenticated) {
      setMe(null);
      return;
    }
    refresh().catch((e) => setError(e instanceof Error ? e.message : "could not load your account"));
  }, [ready, authenticated, refresh]);

  const run = async (label: string, fn: () => Promise<{ hash: string } | void>) => {
    setBusy(label);
    setError("");
    setDone(null);
    try {
      const r = await fn();
      if (r) setDone({ label, hash: r.hash });
      // Monad executes asynchronously, so a read right after a receipt can still show the old state: read twice
      await sleep(2000);
      await refresh();
      await sleep(2500);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setBusy("");
    }
  };

  const sign = async (m: Me, action: number, params: `0x${string}`) =>
    signChallenge(
      challenge({ chainId: m.chainId, registry: m.registry, operator: m.operator, action, params, nonce: BigInt(m.passkey.nonce) }),
      loadPasskey(m.operator)?.id,
    );

  const registerPasskey = () =>
    run("Register passkey", async () => {
      const m = await refresh(); // fresh nonce
      const pk = await createPasskey(user?.email?.address ?? "QUOTA operator");
      savePasskey(m.operator, pk);
      const a = await signChallenge(
        challenge({ chainId: m.chainId, registry: m.registry, operator: m.operator, action: Action.RegisterPasskey, params: registerParams(BigInt(pk.x), BigInt(pk.y)), nonce: BigInt(m.passkey.nonce) }),
        pk.id,
      );
      return api<{ hash: string }>("/api/operator/relay", { action: "registerPasskey", x: pk.x, y: pk.y, assertion: a });
    });

  const enroll = (identity: number) =>
    run(`Enroll agent ${identity}`, async () => {
      const m = await refresh();
      const value = BigInt(limit) * BigInt(m.unitWei);
      const a = await sign(m, Action.Enroll, enrollParams(BigInt(m.agents[identity].idCommitment), BigInt(limit), 0n, value));
      return api<{ hash: string }>("/api/operator/relay", { action: "enroll", identity, limit, assertion: a });
    });

  const topUp = (identity: number) =>
    run(`Add stake to agent ${identity}`, async () => {
      const m = await refresh();
      return api<{ hash: string }>("/api/operator/relay", { action: "topUp", identity, amountWei: BigInt(m.unitWei).toString() });
    });

  const requestUnstake = (identity: number) =>
    run(`Unstake agent ${identity}`, async () => {
      const m = await refresh();
      const a = await sign(m, Action.RequestUnstake, unstakeParams(BigInt(m.agents[identity].idCommitment), dest as Address));
      return api<{ hash: string }>("/api/operator/relay", { action: "requestUnstake", identity, destination: dest, assertion: a });
    });

  const withdraw = (identity: number) => run(`Withdraw agent ${identity}`, () => api<{ hash: string }>("/api/operator/relay", { action: "unstake", identity }));

  const wrongSite = typeof location !== "undefined" && location.hostname !== RP_ID;
  const noPasskeys = typeof window !== "undefined" && !supported();
  const balance = me ? BigInt(me.balanceWei) : 0n;
  const need = me ? BigInt(limit) * BigInt(me.unitWei) + GAS_BUDGET_WEI : 0n;
  const staked = me?.agents.filter((a) => a.state === 1 || a.state === 2).reduce((s, a) => s + BigInt(a.stakeWei), 0n) ?? 0n;
  const active = me?.agents.filter((a) => a.state === 1).length ?? 0;
  const firstFree = me?.agents.find((a) => a.state === 0);
  const canSign = !!me?.passkey.registered && !wrongSite && !noPasskeys && !busy;
  const nowSec = me?.now ?? 0;

  if (!ready) return <div className="wrap shell"><p className="small">Loading…</p></div>;

  if (!authenticated) {
    return (
      <div className="wrap shell">
        <header className="shell-head">
          <div><p className="label" style={{ marginBottom: 8 }}>Operator</p><h1>Your agents</h1></div>
          <span className="demo-note"><i style={{ background: "var(--leaf)" }} />Live · Monad testnet</span>
        </header>
        <section className="block">
          <h2 className="h3">Log in to stake for an agent</h2>
          <p className="small" style={{ maxWidth: "60ch", margin: "12px 0 20px" }}>
            Logging in creates your operator wallet. You then register a passkey (Touch ID, Windows Hello or your phone) that must approve every stake change on-chain, so a leaked agent key cannot move your deposit. This is a testnet: you need a little test MON, and the passkey only works on {RP_ID}.
          </p>
          <button className="btn primary" onClick={login}>Log in with email</button>
        </section>
      </div>
    );
  }

  return (
    <div className="wrap shell">
      <header className="shell-head">
        <div>
          <p className="label" style={{ marginBottom: 8 }}>Operator {me ? short(me.operator) : "…"} · {user?.email?.address}</p>
          <h1>Your agents</h1>
        </div>
        <span className="demo-note"><i style={{ background: "var(--leaf)" }} />Live · Monad testnet <button className="btn sm" style={{ marginLeft: 12 }} onClick={logout}>Log out</button></span>
      </header>

      {(wrongSite || noPasskeys) && (
        <p className="pill wait" role="alert" style={{ margin: "16px 0" }}>
          <i />{noPasskeys ? "This browser cannot create passkeys here (needs HTTPS and WebAuthn)." : `Passkeys are tied to ${RP_ID}. Open https://${RP_ID}/operator to use them.`}
        </p>
      )}
      {error && <p className="pill bad" role="alert" style={{ margin: "16px 0", whiteSpace: "normal" }}><i />{error}</p>}
      {done && (
        <p className="pill ok" role="status" style={{ margin: "16px 0", whiteSpace: "normal" }}>
          <i />{done.label}: confirmed. <a href={`${EXPLORER}/tx/${done.hash}`} target="_blank" rel="noreferrer">View transaction</a>
        </p>
      )}
      {busy && <p className="pill wait" role="status" style={{ margin: "16px 0" }}><i />{busy}… approve with your passkey if asked, then wait for the chain.</p>}

      <dl className="facts">
        <div><dt>Wallet balance</dt><dd className="tnum">{me ? mon(balance, 3) : "–"}<small>MON</small></dd></div>
        <div><dt>Staked</dt><dd className="tnum">{me ? mon(staked, 2) : "–"}<small>MON</small></dd></div>
        <div><dt>Active agents</dt><dd className="tnum">{me ? active : "–"}</dd></div>
        <div><dt>Passkey</dt><dd>{me ? (me.passkey.registered ? "registered" : "not yet") : "–"}</dd></div>
      </dl>

      {me && (
        <div className="two">
          <section className="block">
            <header><h2 className="h3">Agents</h2><span className="small">Identities are derived from your wallet; the secret never leaves the server</span></header>
            <div className="scroll-x">
              <table className="tbl">
                <thead><tr><th>Agent</th><th>State</th><th className="num">Limit</th><th className="num">Stake</th><th><span style={{ position: "absolute", left: -9999 }}>Actions</span></th></tr></thead>
                <tbody>
                  {me.agents.map((a) => (
                    <tr key={a.identity}>
                      <td><div className="name">Agent {a.identity}</div><div className="small mono">{a.state === 0 ? "free slot" : short(`0x${BigInt(a.idCommitment).toString(16)}`)}</div></td>
                      <td>
                        <span className={"pill " + (a.state === 1 ? "ok" : a.state === 4 ? "bad" : "wait")}><i />{STATE[a.state]}</span>
                        {a.state === 2 && <div className="small" style={{ marginTop: 4 }}>{nowSec >= a.unlockAt ? "ready to withdraw" : `unlocks ${new Date(a.unlockAt * 1000).toLocaleString()}`}</div>}
                      </td>
                      <td className="num">{a.state === 0 ? "—" : a.limit}</td>
                      <td className="num">{a.state === 0 ? "—" : `${mon(BigInt(a.stakeWei), 2)} MON`}</td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        {a.state === 1 && <button className="btn sm" style={{ marginRight: 8 }} disabled={!!busy} onClick={() => topUp(a.identity)}>Add {mon(BigInt(me.unitWei), 1)} MON</button>}
                        {a.state === 1 && <button className="btn sm" disabled={!canSign} onClick={() => requestUnstake(a.identity)}>Unstake</button>}
                        {a.state === 2 && <button className="btn sm" disabled={!!busy || nowSec < a.unlockAt} onClick={() => withdraw(a.identity)}>Withdraw</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small" style={{ marginTop: 12 }}>Adding stake raises what a slash is worth; the per-epoch limit is set when you enroll. Unstaking removes the agent at once, then holds the deposit for {Math.round(me.unstakeDelay / 60)} minutes so a cheater cannot dodge a slash.</p>
          </section>

          <section className="block">
            <header><h2 className="h3">Custody</h2></header>
            {!me.passkey.registered ? (
              <>
                <p className="small" style={{ marginBottom: 12 }}>Step 1: create a passkey on this device and register it with the contract. It will approve every enroll and unstake. You will be asked for it twice (create, then sign).</p>
                <button className="btn primary" disabled={!!busy || wrongSite || noPasskeys} onClick={registerPasskey}>Create passkey and register</button>
              </>
            ) : (
              <>
                <div className="check" style={{ borderTop: "1.5px solid var(--ink)" }}><div><b>Passkey registered</b><small>approvals so far: {me.passkey.nonce}{loadPasskey(me.operator) ? "" : " · created on another device or browser"}</small></div></div>
                <div className="field" style={{ marginTop: 16 }}>
                  <label htmlFor="dest">Withdrawal address</label>
                  <input id="dest" type="text" value={dest} onChange={(e) => setDest(e.target.value.trim())} spellCheck={false} autoComplete="off" className="mono" />
                  <span className="help">Where an unstake pays out. It is part of what your passkey signs, so nobody can redirect it.</span>
                </div>
              </>
            )}

            <div style={{ marginTop: 40 }}>
              <h2 className="h3" style={{ marginBottom: 12 }}>Create an agent</h2>
              <div className="field">
                <label htmlFor="l">Requests per epoch</label>
                <input id="l" type="number" min={1} max={me.maxLimit} step={1} value={limit} onChange={(e) => setLimit(Math.min(me.maxLimit, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
                <span className="help">Stake required: <b className="tnum">{mon(BigInt(limit) * BigInt(me.unitWei), 2)} MON</b> ({mon(BigInt(me.unitWei), 2)} per request, up to {me.maxLimit} here). Plus about {mon(GAS_BUDGET_WEI, 2)} MON of gas.</span>
              </div>
              {balance < need && (
                <div className="field">
                  <p className="pill wait" style={{ whiteSpace: "normal" }}><i />This wallet needs about {mon(need, 2)} MON. Send test MON to it from the <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Monad faucet</a>:</p>
                  <p className="mono small" style={{ wordBreak: "break-all", margin: "8px 0" }}>{me.operator}</p>
                  <button className="btn sm" onClick={() => { void navigator.clipboard?.writeText(me.operator); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy address"}</button>
                </div>
              )}
              <button className="btn primary" disabled={!canSign || !firstFree || balance < need} onClick={() => firstFree && enroll(firstFree.identity)}>
                {firstFree ? `Enroll agent ${firstFree.identity} with passkey` : "No free identity slots"}
              </button>
              {!me.passkey.registered && <p className="small" style={{ marginTop: 8 }}>Register your passkey first.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
