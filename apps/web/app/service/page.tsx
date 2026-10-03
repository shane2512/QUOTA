"use client";
import { useEffect, useRef, useState } from "react";
import { servers, slashes, short } from "@/lib/demo";

type Row = { id: number; t: string; nul: string; k: number; bad: boolean };
const now = () => new Date().toTimeString().slice(0, 8);

export default function Service() {
  const [rows, setRows] = useState<Row[]>([]);
  const [per, setPer] = useState(100);
  const [trees, setTrees] = useState({ open: true, screened: false });
  const [saved, setSaved] = useState(false);
  const s = servers[0];
  const seq = useRef(0);

  useEffect(() => {
    const tick = () => {
      const id = ++seq.current;
      const bad = id % 17 === 0;
      setRows((r) => [{ id, t: now(), nul: short(), k: bad ? 7 : Math.floor(Math.random() * 60), bad }, ...r].slice(0, 14));
    };
    tick();
    const h = setInterval(tick, 1100);
    return () => clearInterval(h);
  }, []);

  return (
    <div className="wrap shell">
      <header className="shell-head">
        <div>
          <p className="label" style={{ marginBottom: 8 }}>{s.name} · {s.kind}</p>
          <h1>Service console</h1>
        </div>
        <span className="demo-note"><i />Demo data</span>
      </header>

      <dl className="facts">
        <div><dt>Requests today</dt><dd className="tnum">{(s.calls + rows.length).toLocaleString("en-US")}</dd></div>
        <div><dt>Violations</dt><dd className="tnum">{s.violations + rows.filter((r) => r.bad).length}</dd></div>
        <div><dt>Slash rewards</dt><dd className="tnum">3.4<small>MON</small></dd></div>
        <div><dt>Per epoch limit</dt><dd className="tnum">{per}</dd></div>
      </dl>

      <div className="two">
        <section className="block">
          <header><h2 className="h3">Live requests</h2><span className="pill ok"><i />streaming</span></header>
          <div className="feed" aria-label="Live verified requests">
            {rows.map((r) => (
              <div key={r.id} className={"r" + (r.bad ? " bad" : "")}>
                <span>{r.t}</span><span>{r.nul}</span><span>k={r.k}</span>
                <span>{r.bad ? "repeat k" : "verified"}</span>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 12 }}>Rows show nullifiers, never callers. A repeated request number queues a slash.</p>
        </section>

        <section className="block">
          <header><h2 className="h3">Policy</h2></header>
          <form onSubmit={(e) => { e.preventDefault(); setSaved(true); setTimeout(() => setSaved(false), 2200); }}>
            <div className="field">
              <label htmlFor="per">Requests per epoch</label>
              <input id="per" type="number" min={1} value={per} onChange={(e) => setPer(Math.max(1, Number(e.target.value) || 1))} />
              <span className="help">Epoch is one hour. Quotas are per server, so an agent&apos;s total exposure is this number for every server it calls.</span>
            </div>
            <fieldset>
              <legend style={{ font: "700 0.875rem var(--f-sans)", marginBottom: 8 }}>Accepted trust lists</legend>
              <label className="check"><input type="checkbox" checked={trees.open} onChange={(e) => setTrees({ ...trees, open: e.target.checked })} /><span><b>Open</b><small>Anyone who stakes. The default.</small></span></label>
              <label className="check"><input type="checkbox" checked={trees.screened} onChange={(e) => setTrees({ ...trees, screened: e.target.checked })} /><span><b>Screened</b><small>Wallet profiled by a screener. Beta, labels only for now.</small></span></label>
              <label className="check" style={{ opacity: 0.55 }}><input type="checkbox" disabled /><span><b>Compliant</b><small>Not available. Needs a verified-asset partner we do not have.</small></span></label>
            </fieldset>
            <button className="btn primary" type="submit">{saved ? "Saved" : "Save policy"}</button>
          </form>
        </section>
      </div>

      <section className="block">
        <header><h2 className="h3">Slash history</h2><span className="small">Claims go through commit then reveal</span></header>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Time</th><th>Commit</th><th>Reveal</th><th className="num">To you</th><th className="num">Burned</th><th>State</th></tr></thead>
            <tbody>
              {slashes.map((x) => (
                <tr key={x.id}>
                  <td className="tnum">{x.time}</td><td className="mono">{x.commit}</td><td className="mono">{x.reveal}</td>
                  <td className="num">{x.reward.toFixed(1)} MON</td><td className="num">{x.burned.toFixed(1)} MON</td>
                  <td><span className={"pill " + (x.state === "paid" ? "ok" : "wait")}><i />{x.state}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
