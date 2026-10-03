"use client";
import { useState } from "react";
import Passkey from "@/components/Passkey";
import { agents as seed, UNIT_MON } from "@/lib/demo";

type Agent = { id: string; name: string; role: string; limit: number; used: number; stake: number; status: string };

const Ticks = ({ used, limit }: { used: number; limit: number }) => {
  const n = 20, on = Math.round((used / limit) * n);
  return <span className={"ticks" + (used / limit > 0.9 ? " hot" : "")} aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? "on" : ""} />)}</span>;
};

export default function Operator() {
  const [list, setList] = useState<Agent[]>(seed.map((a) => ({ ...a })));
  const [pk, setPk] = useState<{ text: string; run: () => void } | null>(null);
  const [toast, setToast] = useState("");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState(60);
  const note = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2600); };
  const stake = +(limit * UNIT_MON).toFixed(1);
  const totalStake = list.reduce((s, a) => s + a.stake, 0);
  const totalUsed = list.reduce((s, a) => s + a.used, 0), totalLimit = list.reduce((s, a) => s + a.limit, 0);

  const ask = (text: string, run: () => void) => setPk({ text, run });
  const done = () => { pk?.run(); setPk(null); };

  return (
    <div className="wrap shell">
      <header className="shell-head">
        <div>
          <p className="label" style={{ marginBottom: 8 }}>Operator 0x7a3f…91c2</p>
          <h1>Your agents</h1>
        </div>
        <span className="demo-note"><i />Demo data</span>
      </header>

      <dl className="facts">
        <div><dt>Staked</dt><dd className="tnum">{totalStake.toFixed(1)}<small>MON</small></dd></div>
        <div><dt>Agents</dt><dd className="tnum">{list.length}</dd></div>
        <div><dt>Requests this epoch</dt><dd className="tnum">{totalUsed}<small>/ {totalLimit}</small></dd></div>
        <div><dt>Epoch resets in</dt><dd className="tnum">38<small>min</small></dd></div>
      </dl>

      <div className="two">
        <section className="block">
          <header><h2 className="h3">Agents</h2></header>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Agent</th><th>Used this epoch</th><th className="num">Stake</th><th>Status</th><th><span className="sr" style={{ position: "absolute", left: -9999 }}>Actions</span></th></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td><div className="name">{a.name}</div><div className="small">{a.role}</div></td>
                    <td><Ticks used={a.used} limit={a.limit} /> <span className="tnum small" style={{ marginLeft: 8 }}>{a.used} / {a.limit}</span></td>
                    <td className="num">{a.stake.toFixed(1)} MON</td>
                    <td><span className={"pill " + (a.status === "active" ? "ok" : "wait")}><i />{a.status}</span></td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <button className="btn sm" style={{ marginRight: 8 }} onClick={() => ask(`Top up ${a.name} by 2.0 MON (+20 requests per epoch).`, () => { setList((l) => l.map((x) => x.id === a.id ? { ...x, stake: x.stake + 2, limit: x.limit + 20 } : x)); note(`${a.name} topped up`); })}>Top up</button>
                      <button className="btn sm" disabled={a.status !== "active"} onClick={() => ask(`Request unstake for ${a.name} (${a.stake.toFixed(1)} MON). A delay applies before withdrawal.`, () => { setList((l) => l.map((x) => x.id === a.id ? { ...x, status: "unstaking" } : x)); note(`${a.name} unstake requested`); })}>Unstake</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="block">
          <header><h2 className="h3">Create an agent</h2></header>
          <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; ask(`Enroll ${name} with a ${stake} MON deposit and ${limit} requests per epoch.`, () => { setList((l) => [...l, { id: name.toLowerCase().replace(/\W+/g, "-") + l.length, name: name.trim(), role: "New agent", limit, used: 0, stake, status: "active" }]); setName(""); note("Agent enrolled"); }); }}>
            <div className="field">
              <label htmlFor="n">Name</label>
              <input id="n" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Atlas" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="l">Requests per epoch</label>
              <input id="l" type="number" min={10} max={1000} step={10} value={limit} onChange={(e) => setLimit(Math.max(10, Number(e.target.value) || 10))} />
              <span className="help">Stake required: <b className="tnum">{stake} MON</b> ({UNIT_MON} per request). Allowance is linear in stake, so splitting it gains nothing.</span>
            </div>
            <button className="btn primary" type="submit" disabled={!name.trim()}>Enroll with passkey</button>
          </form>

          <div style={{ marginTop: 48 }}>
            <h2 className="h3" style={{ marginBottom: 12 }}>Custody</h2>
            <div className="check" style={{ borderTop: "1.5px solid var(--ink)" }}><div><b>Passkey</b><small>Touch ID on this device, registered 2 Oct</small></div></div>
            <div className="check"><div><b>Withdrawal address</b><small className="mono">0x7a3f…91c2</small></div></div>
            <p className="small" style={{ marginTop: 12 }}>Unstaking, limit changes and a new withdrawal address each need a passkey tap, verified on-chain.</p>
          </div>
        </section>
      </div>

      <Passkey action={pk?.text ?? null} onClose={() => setPk(null)} onDone={done} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
