"use client";
import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createDynamicClient, logout } from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";
import { createWaasWalletAccounts, getChainsMissingWaasWalletAccounts, hasDelegatedAccess, revokeWaasDelegation } from "@dynamic-labs-sdk/client/waas";
import { DynamicProvider, useDelegateWaasKeyShares, useGetWalletAccounts, useInitStatus, useSendEmailOTP, useUser, useVerifyOTP } from "@dynamic-labs-sdk/react-hooks";

const EXPLORER = "https://testnet.monadvision.com";
const FAUCET = "https://faucet.monad.xyz";

type Live = { provider?: string; address?: string } | null;

let created = false; // one client per page load (createDynamicClient reads window)

function useLiveSlasher(): Live | undefined {
  const [live, setLive] = useState<Live | undefined>(undefined); // undefined = not loaded yet
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const d = await (await fetch("/api/service", { cache: "no-store" })).json();
        if (!stop) setLive(d?.feed?.slasher ?? null);
      } catch {
        if (!stop) setLive(null);
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  return live;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const send = useSendEmailOTP();
  const verify = useVerifyOTP();
  const otp = send.data;
  const err = send.error ?? verify.error;
  return (
    <section className="panel" aria-labelledby="s1">
      <h2 className="h3" id="s1">Sign in</h2>
      <p className="small">An email code creates your Dynamic embedded wallet. It stays yours; QUOTA never holds it.</p>
      {!otp ? (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate({ email }); }} style={{ marginTop: 20 }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="text" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <button className="btn primary" type="submit" disabled={send.isPending || !email.includes("@")}>{send.isPending ? "Sending…" : "Send code"}</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify.mutate({ otpVerification: otp, verificationToken: code }); }} style={{ marginTop: 20 }}>
          <div className="field">
            <label htmlFor="code">Code from your email</label>
            <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required />
          </div>
          <button className="btn primary" type="submit" disabled={verify.isPending || code.length < 4}>{verify.isPending ? "Checking…" : "Verify"}</button>
        </form>
      )}
      {err && <p className="notice bad" role="alert" style={{ marginTop: 16 }}><i />{msg(err)}</p>}
    </section>
  );
}

function Console() {
  const { data: init } = useInitStatus();
  const { data: user } = useUser();
  const { data: accounts = [] } = useGetWalletAccounts();
  const delegate = useDelegateWaasKeyShares();
  const live = useLiveSlasher();
  const [note, setNote] = useState<{ kind: "ok" | "bad" | "wait"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const creating = useRef(false);

  const account = accounts[0];
  const address = account?.address as string | undefined;
  const delegated = account ? hasDelegatedAccess({ walletAccount: account }) : false;
  const serverSees = !!address && live?.provider === "dynamic-delegated" && live.address?.toLowerCase() === address.toLowerCase();

  // the embedded wallet is not created by login: make it once when a user exists and has none
  useEffect(() => {
    if (init !== "finished" || !user || accounts.length > 0 || creating.current) return;
    const missing = getChainsMissingWaasWalletAccounts();
    if (missing.length === 0) return;
    creating.current = true;
    createWaasWalletAccounts({ chains: missing }).catch((e) => setNote({ kind: "bad", text: `Could not create your wallet: ${msg(e)}` })).finally(() => { creating.current = false; });
  }, [init, user, accounts.length]);

  if (init !== "finished") return <section className="panel" aria-busy="true"><span className="skel" style={{ width: "40%" }} /><div className="skel-rows"><span className="skel" /><span className="skel" /></div></section>;
  if (!user) return <SignIn />;

  return (
    <>
      <div className="op-account">
        <span className="op-email">{user.email}</span>
        <button className="btn sm" onClick={() => { void logout(); }}>Log out</button>
      </div>

      <div className="op-grid">
        <section className="panel" aria-labelledby="s2">
          <h2 className="h3" id="s2">Your wallet</h2>
          {!address ? (
            <p className="small" role="status" aria-live="polite"><i className="spin" /> Creating your embedded wallet…</p>
          ) : (
            <>
              <p className="small">Dynamic embedded wallet (MPC). Slashes signed on your behalf pay gas from it, and the reward comes back to it.</p>
              <dl className="stats" style={{ marginTop: 16 }}>
                <div><dt>Address</dt><dd className="mono"><a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">{short(address)}</a></dd></div>
              </dl>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                <button className="btn sm" onClick={() => { void navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }); }}>{copied ? "Copied" : "Copy address"}</button>
                <a className="btn sm" href={FAUCET} target="_blank" rel="noreferrer">Get test MON</a>
              </div>
              <p className="small" style={{ marginTop: 12 }}>Keep at least 0.3 MON in it: a slash costs about that much gas, then pays out more than it costs.</p>
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="s3">
          <h2 className="h3" id="s3">Delegate slashing to QUOTA</h2>
          <p className="small">You approve once. QUOTA&apos;s server can then sign slash transactions from your wallet and nothing else: it cannot export your key or change your wallet&apos;s rules. You can revoke at any time.</p>
          <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {!delegated ? (
              <button
                className="btn primary"
                disabled={!account || delegate.isPending}
                onClick={() => {
                  setNote({ kind: "wait", text: "Approving… Dynamic is sharing signing rights with QUOTA's server." });
                  delegate.mutate({ walletAccount: account! }, {
                    onSuccess: () => setNote({ kind: "ok", text: "Approved. Waiting for Dynamic to tell the server…" }),
                    onError: (e) => setNote({ kind: "bad", text: `Delegation failed: ${msg(e)}` }),
                  });
                }}
              >
                {delegate.isPending ? "Approving…" : "Approve delegation"}
              </button>
            ) : (
              <button
                className="btn"
                onClick={() => {
                  setNote({ kind: "wait", text: "Revoking…" });
                  revokeWaasDelegation({ walletAccount: account! }).then(() => setNote({ kind: "ok", text: "Revoked. The server drops your signing rights when Dynamic notifies it." })).catch((e) => setNote({ kind: "bad", text: `Could not revoke: ${msg(e)}` }));
                }}
              >
                Revoke delegation
              </button>
            )}
          </div>
          <div aria-live="polite">{note && <p className={`notice ${note.kind}`} role="status" style={{ marginTop: 16 }}><i />{note.text}</p>}</div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 20 }} aria-labelledby="s4">
        <h2 className="h3" id="s4">Server status</h2>
        <p className="small">Read live from the demo server&apos;s public feed.</p>
        <div style={{ marginTop: 16 }}>
          {live === undefined ? <span className="skel" style={{ width: "40%" }} /> : serverSees ? (
            <p className="pill ok"><i />Slashing from your wallet {short(address!)}</p>
          ) : live?.provider ? (
            <p className="pill wait"><i />Server slasher: {live.provider === "dynamic" ? "QUOTA's Dynamic server wallet" : live.provider === "dynamic-delegated" ? "another operator's wallet" : "local key"}{live.address ? ` ${short(live.address)}` : ""}</p>
          ) : (
            <p className="pill"><i />Server feed unavailable</p>
          )}
        </div>
      </section>
    </>
  );
}

export default function Slasher({ environmentId }: { environmentId: string }) {
  const [ready, setReady] = useState(false);
  const [qc] = useState(() => new QueryClient());
  const [client, setClient] = useState<ReturnType<typeof createDynamicClient> | null>(null);

  useEffect(() => {
    if (!environmentId || created) return;
    created = true;
    const c = createDynamicClient({ environmentId, metadata: { name: "QUOTA", universalLink: window.location.origin } });
    addEvmExtension();
    setClient(c);
    setReady(true);
  }, [environmentId]);

  return (
    <div className="wrap shell">
      <header className="shell-head">
        <div>
          <p className="label" style={{ marginBottom: 8 }}>Service operator · Dynamic</p>
          <h1>Delegate your slasher</h1>
        </div>
        <span className="demo-note"><i />Monad testnet</span>
      </header>
      <p className="lede" style={{ maxWidth: "62ch", margin: "28px 0 32px" }}>
        When an agent cheats, someone claims its stake and keeps half. Sign in with your own Dynamic wallet and approve delegation, and QUOTA&apos;s server signs those slashes from your wallet, so the reward is yours.
      </p>
      {!environmentId ? (
        <p className="empty">Dynamic is not configured on this deployment (no NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID).</p>
      ) : !ready || !client ? (
        <section className="panel" aria-busy="true"><span className="skel" style={{ width: "40%" }} /><div className="skel-rows"><span className="skel" /><span className="skel" /></div></section>
      ) : (
        <QueryClientProvider client={qc}>
          <DynamicProvider client={client}>
            <Console />
          </DynamicProvider>
        </QueryClientProvider>
      )}
    </div>
  );
}
