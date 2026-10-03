"use client";
import { useEffect, useRef, useState } from "react";
import { hex, short } from "@/lib/demo";

const N = 8;
const STOPS = ["Violation", "Secret recovered", "Commit", "Reveal", "Paid"];
type L = { t: string; msg: string; cls?: string };
const clock = () => new Date().toTimeString().slice(0, 8);

export default function Demo() {
  const [k, setK] = useState(0);
  const [stage, setStage] = useState(-1); // -1 none, 0..4 index of STOPS reached
  const [log, setLog] = useState<L[]>([]);
  const timers = useRef<number[]>([]);
  const push = (msg: string, cls?: string) => setLog((l) => [{ t: clock(), msg, cls }, ...l].slice(0, 40));
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  const send = () => {
    if (k >= N || stage >= 0) return;
    setK(k + 1);
    push(`request k=${k} verified · nullifier ${short()} · who: unknown`, "ok");
  };

  const cheat = () => {
    if (stage >= 0 || k === 0) return;
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    setStage(0);
    push(`request k=${k - 1} sent twice with a different message`, "bad");
    at(700, () => { setStage(1); push(`two shares on one line: secret a₀ = 0x${hex(8)}… recovered`, "bad"); });
    at(1700, () => { setStage(2); push(`commitSlash(${short()}) submitted. A searcher sees a hash, not the secret`); });
    at(2700, () => { setStage(3); push(`revealSlash(a₀, limit, receiver) after 1 block. Copy attempt with another receiver: hash mismatch, reverted`); });
    at(3500, () => { setStage(4); push(`stake forfeited: reward to slasher, remainder burned`, "ok"); });
  };

  const reset = () => { clear(); setK(0); setStage(-1); setLog([]); };

  return (
    <div className="wrap shell">
      <header className="shell-head">
        <div>
          <p className="label" style={{ marginBottom: 8 }}>Agent Scout · lantern-search · N = {N} per epoch</p>
          <h1>Watch a cheater get slashed</h1>
        </div>
        <span className="demo-note"><i />Simulation</span>
      </header>

      <div className="line" role="list" aria-label="Slash progress">
        {STOPS.map((s, i) => (
          <div key={s} style={{ display: "contents" }}>
            <div role="listitem" className={"stop" + (stage >= i ? " done" : "") + (stage === i - 1 && stage >= -1 ? "" : "")}><i />{s}</div>
            {i < STOPS.length - 1 && <div className={"seg" + (stage > i ? " done" : "")} />}
          </div>
        ))}
      </div>

      <div className="stage">
        <section>
          <h2 className="h3">Agent</h2>
          <p className="small">Scout holds a secret key and a staked place on the list. Each request spends one request number.</p>
          <div className="controls">
            <button className="btn primary" onClick={send} disabled={k >= N || stage >= 0}>Send request #{Math.min(k, N - 1)}</button>
            <button className="btn danger" onClick={cheat} disabled={k === 0 || stage >= 0}>Reuse request #{Math.max(k - 1, 0)}</button>
            <button className="btn" onClick={reset}>Reset</button>
          </div>
          <p className="label" style={{ marginBottom: 8 }}>Request numbers used</p>
          <span className={"ticks" + (stage >= 0 ? " hot" : "")} style={{ transform: "scale(1.6)", transformOrigin: "left center", marginBottom: 16 }} aria-label={`${k} of ${N} used`}>
            {Array.from({ length: N }, (_, i) => <i key={i} className={i < k ? "on" : ""} />)}
          </span>
          <p className="small" style={{ marginTop: 18 }}>
            {k === 0 ? "Send a request or two first." : stage >= 0 ? "Reusing a number is the only way to exceed the quota, and it exposes the key." : `${N - k} of ${N} requests left this epoch.`}
          </p>
        </section>

        <section>
          <h2 className="h3">Service log</h2>
          <p className="small">What lantern-search sees: nullifiers and proofs. Never a caller.</p>
          {log.length === 0 ? (
            <p className="empty">Nothing yet. Send a request to see what the service learns, which is very little.</p>
          ) : (
            <div className="log" aria-live="polite">
              {log.map((l, i) => <div key={i} className={l.cls}><span>{l.t}</span><span>{l.msg}</span></div>)}
            </div>
          )}
        </section>
      </div>
      <p className="small" style={{ marginTop: 48, maxWidth: "62ch" }}>
        This page simulates the flow with synthetic values. The live version runs the same steps on Monad testnet: a repeat nullifier recovers the key, the slasher commits a hash, then reveals after a block.
      </p>
    </div>
  );
}
