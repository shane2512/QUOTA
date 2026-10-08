"use client";
import { useEffect, useState } from "react";
import { EXPLORER, REGISTRY } from "@/lib/registry";

type Chain = {
  registry: string; block: string; leavesTotal: number; leavesActive: number; leavesRemoved: number;
  balanceWei: string; burnedWei: string; unitWei: string; shareBps: number; depth: number;
};
type Row = { t: number; status: string; nullifier?: string };
type Slash = { t: number; idCommitment: string; status: string; commit?: string; reveal?: string };
type Feed = { serverId: string; slashing: boolean; epochSeconds: number; startedAt: number; counts: Record<string, number>; rows: Row[]; slashes: Slash[] };
type Data = { chain: Chain | null; chainError: string | null; feed: Feed | null; feedError: string | null };

const mon = (wei: string | bigint, dp = 3) => (Number(wei) / 1e18).toFixed(dp);
const time = (ms: number) => new Date(ms).toTimeString().slice(0, 8);
const pill = (s: string) => (s === "verified" ? "ok" : s === "violation" ? "bad" : "wait");
const txLink = (h?: string) => (h ? <a className="mono" href={`${EXPLORER}/tx/${h}`} target="_blank" rel="noreferrer">{h.slice(0, 8)}…{h.slice(-4)}</a> : <span className="mono">—</span>);

export default function Service() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch("/api/service", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as Data;
        if (live) { setD(j); setErr(""); }
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : "request failed");
      }
    };
    void load();
    const h = setInterval(load, 3000);
    return () => { live = false; clearInterval(h); };
  }, []);

  const c = d?.chain, f = d?.feed;
  const burned = c ? BigInt(c.burnedWei) : 0n;
  const paid = c && c.shareBps < 10000 ? (burned * BigInt(c.shareBps)) / BigInt(10000 - c.shareBps) : 0n;
  const staked = c ? BigInt(c.balanceWei) - burned : 0n;
  const verified = f?.counts.verified ?? 0;
  const violations = f?.counts.violation ?? 0;
  const rejected = f ? Object.entries(f.counts).filter(([k]) => k !== "verified").reduce((s, [, n]) => s + n, 0) : 0;
  const loading = !d && !err; // first fetch still in flight: show skeletons, not dashes
  const sk = <span className="skel" aria-hidden="true" />;

  return (
    <div className="wrap shell">
      <header className="shell-head">
        <div>
          <p className="label" style={{ marginBottom: 8 }}>{f ? `${f.serverId} · MCP tool server` : "Service console"}</p>
          <h1>Service console</h1>
        </div>
        <span className="demo-note">
          <i style={{ background: c ? "var(--leaf)" : "var(--amber)" }} />
          {c ? `Live · Monad testnet · block ${Number(c.block).toLocaleString("en-US")}` : err || d?.chainError || "Connecting…"}
        </span>
      </header>

      <dl className="facts">
        <div><dt>Agents in the tree</dt><dd className="tnum">{loading ? sk : c ? c.leavesActive : "–"}<small>{c ? `${c.leavesRemoved} removed` : ""}</small></dd></div>
        <div><dt>Staked in the registry</dt><dd className="tnum">{loading ? sk : c ? mon(staked, 2) : "–"}{!loading && <small>MON</small>}</dd></div>
        <div><dt>Verified requests</dt><dd className="tnum">{loading ? sk : f ? verified.toLocaleString("en-US") : "–"}<small>{f ? `${rejected} rejected` : !loading ? "feed offline" : ""}</small></dd></div>
        <div><dt>Slashed, paid out</dt><dd className="tnum">{loading ? sk : c ? mon(paid, 3) : "–"}{!loading && <small>MON</small>}</dd></div>
      </dl>

      <div className="two">
        <section className="block">
          <header>
            <h2 className="h3">Live requests</h2>
            {f ? <span className="pill ok"><i />streaming</span> : loading ? <span className="pill"><i />connecting</span> : <span className="pill wait"><i />demo server offline</span>}
          </header>
          {f ? (
            <div className="scroll-x">
              <table className="tbl">
                <thead><tr><th>Time</th><th>Nullifier</th><th>Result</th></tr></thead>
                <tbody>
                  {f.rows.length === 0 && <tr><td colSpan={3} className="small">No requests yet. Run an agent against the server.</td></tr>}
                  {f.rows.slice(0, 14).map((r, i) => (
                    <tr key={`${r.t}-${i}`}>
                      <td className="tnum">{time(r.t)}</td>
                      <td className="mono">{r.nullifier ?? "—"}</td>
                      <td><span className={"pill " + pill(r.status)}><i />{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : loading ? (
            <div className="skel-rows" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className="skel" />)}</div>
          ) : (
            <div className="state">
              <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 5" /><circle cx="24" cy="24" r="4" fill="var(--amber)" /></svg>
              <b>The request feed is offline</b>
              <p>Registry numbers above are live from Monad. Request rows come from a demo server&apos;s own verifier, and none is reachable{d?.feedError ? `: ${d.feedError}` : " right now"}.</p>
              <p className="small">Run one locally, then point <code>FEED_URL</code> at its <code>/feed</code>:</p>
              <pre className="code"><code>pnpm --filter @quota/demo-mcp start</code></pre>
            </div>
          )}
          <p className="small" style={{ marginTop: 12 }}>Rows show nullifiers, never callers. A repeated message id with a different request is a violation: the server recovers the agent&apos;s secret and starts a slash.</p>
        </section>

        <section className="block">
          <header><h2 className="h3">This server</h2></header>
          <dl className="kv">
            <div><dt>Registry</dt><dd><a className="mono" href={`${EXPLORER}/address/${REGISTRY}`} target="_blank" rel="noreferrer">{REGISTRY.slice(0, 10)}…{REGISTRY.slice(-6)}</a></dd></div>
            <div><dt>Epoch</dt><dd>{f ? `${f.epochSeconds / 60} min` : "—"}</dd></div>
            <div><dt>Stake per message</dt><dd>{c ? `${mon(c.unitWei, 2)} MON` : "—"}</dd></div>
            <div><dt>Slash share to the slasher</dt><dd>{c ? `${c.shareBps / 100}% (rest locked)` : "—"}</dd></div>
            <div><dt>Slashing on this server</dt><dd>{f ? (f.slashing ? "on" : "off") : "—"}</dd></div>
            <div><dt>Violations seen</dt><dd className="tnum">{f ? violations : "—"}</dd></div>
          </dl>
          <h3 className="h3" style={{ margin: "32px 0 8px" }}>Protect your own API</h3>
          <p className="small">A service is configured in code, not here. The limit per epoch is whatever stake each agent put up; you choose a minimum by rejecting proofs from the registry you do not accept.</p>
          <pre className="code" style={{ marginTop: 12 }}><code>{`app.use(quotaExpress(new QuotaVerifier({
  serverId: "my-api",
  vkey, roots: new RegistryRootChecker(client, REGISTRY),
})));`}</code></pre>
          <p className="small" style={{ marginTop: 8 }}>See the <a href="/docs">docs</a> for the 10-minute quickstart.</p>
        </section>
      </div>

      <section className="block">
        <header><h2 className="h3">Slash history</h2><span className="small">Claims go through commit then reveal (not BTX)</span></header>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Time</th><th>Agent</th><th>Commit</th><th>Reveal</th><th>State</th></tr></thead>
            <tbody>
              {(!f || f.slashes.length === 0) && (
                <tr><td colSpan={5} className="small">{f ? "No slashes since this server started." : "Needs the demo server feed."} Total on-chain: {c ? `${mon(paid, 3)} MON paid and ${mon(burned, 3)} MON locked` : "—"}. <a href={`${EXPLORER}/address/${REGISTRY}`} target="_blank" rel="noreferrer">Full history on the explorer</a>.</td></tr>
              )}
              {f?.slashes.map((x, i) => (
                <tr key={`${x.t}-${i}`}>
                  <td className="tnum">{time(x.t)}</td><td className="mono">{x.idCommitment}</td>
                  <td>{txLink(x.commit)}</td><td>{txLink(x.reveal)}</td>
                  <td><span className={"pill " + (x.status === "slashed" ? "ok" : "wait")}><i />{x.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
