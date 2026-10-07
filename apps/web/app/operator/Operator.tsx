"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { Action, challenge, enrollParams, registerParams, unstakeParams } from "@/lib/passkey-core";
import { createPasskey, loadPasskey, savePasskey, signChallenge, supported } from "@/lib/passkey-browser";
import { Dashboard, SignedOut, type Me } from "./View";

const RP_ID = process.env.NEXT_PUBLIC_RP_ID || "quota-metro.vercel.app";
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

  if (!ready) return <div className="wrap shell"><p className="empty">Loading…</p></div>;
  if (!authenticated) return <SignedOut onLogin={login} rpId={RP_ID} />;

  return (
    <Dashboard
      me={me} email={user?.email?.address} busy={busy} error={error} done={done}
      wrongSite={wrongSite} noPasskeys={noPasskeys} rpId={RP_ID} localPasskey={!!(me && loadPasskey(me.operator))}
      limit={limit} setLimit={setLimit} dest={dest} setDest={setDest} copied={copied}
      onCopy={() => { if (!me) return; void navigator.clipboard?.writeText(me.operator); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      onLogout={logout} onRegister={registerPasskey} onEnroll={enroll} onTopUp={topUp} onUnstake={requestUnstake} onWithdraw={withdraw}
    />
  );
}
