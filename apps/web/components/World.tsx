"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { createWorld as CreateWorld } from "./scene3d";

const T_END = 120; // keep in sync with scene3d
const holdStart = (i: number) => [18, 42, 66, 90][i];

gsap.registerPlugin(ScrollTrigger);

const SCENES = [
  { name: "Stake once, with a tap.", body: "An operator locks a deposit with a passkey and the agent joins a public list of staked members. Allowance scales with the deposit, so splitting it gains nothing.", rows: [["Custody", "Passkey, checked on-chain"], ["Allowance", "Linear in stake"]] },
  { name: "Prove it's within quota.", body: "Every request carries a zero-knowledge proof: a staked member, request k of N this epoch. It never says which member.", rows: [["Circuit", "RLN-v2, audited and reused"], ["Scope", "Quotas are per server"]] },
  { name: "Verified. Linked to no one.", body: "The service checks the proof off-chain and learns nothing about who sent it. Two requests cannot be tied together.", rows: [["Check", "Off-chain, milliseconds"], ["Memory", "One line per nullifier"]] },
  { name: "Cheat once, forfeit the deposit.", body: "Reusing a request number leaks the agent's secret key. Anyone holding it can claim the stake, through a commit then reveal so the claim can't be copied.", rows: [["Claim path", "Commit, then reveal"], ["Payout", "Slasher paid, rest burned"]] },
];

export default function World() {
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(-1); // -1 hero, 0-3 stations, 4 outro
  const [ok, setOk] = useState(true);
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);
  const api = useRef<ReturnType<typeof CreateWorld> | null>(null);

  useEffect(() => {
    const el = track.current, cv = canvas.current;
    if (!el || !cv) return;
    let dead = false, st: ScrollTrigger | undefined, ro: ResizeObserver | undefined;
    (async () => {
      try { await Promise.all([document.fonts.load('800 100px "Archivo Variable"'), document.fonts.load('700 40px "JetBrains Mono Variable"')]); } catch {}
      if (dead) return;
      try {
        const { createWorld } = await import("./scene3d"); // three.js loads only now, after first paint
        if (dead) return;
        api.current = createWorld(cv, { onScene: setOn, onReady: () => setReady(true) });
      } catch { setOk(false); setReady(true); return; }
      st = ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom bottom", onUpdate: (s) => api.current?.setProgress(s.progress) });
      api.current.setProgress(st.progress);
      ro = new ResizeObserver(() => api.current?.resize());
      ro.observe(cv);
    })();
    return () => { dead = true; st?.kill(); ro?.disconnect(); api.current?.dispose(); api.current = null; };
  }, []);

  const jump = (i: number) => {
    const el = track.current; if (!el) return;
    const t = i < 0 ? 0 : i > 3 ? T_END : holdStart(i);
    window.scrollTo({ top: el.offsetTop + (t / T_END) * (el.offsetHeight - window.innerHeight), behavior: "smooth" });
  };
  const shown = on >= 0 && on <= 3;

  return (
    <div className="world-track" ref={track}>
      <div className="world">
        <canvas ref={canvas} className="map" role="img" aria-label="A three-dimensional transit line with four stations: Stake, Prove, Check and Slash." />

        {!gone && (
          <div className="loader" data-done={ready} onTransitionEnd={() => ready && setGone(true)} aria-hidden="true">
            <div className="bar"><i /></div>
            <span className="label">Loading the line</span>
          </div>
        )}

        <div className="hero" style={{ opacity: on === -1 ? 1 : 0, transform: on === -1 ? "none" : "translateY(-12px)", pointerEvents: on === -1 ? "auto" : "none" }}>
          <h1 className="display">Rate limits that keep no record.</h1>
          <p className="lede">Agents lock a deposit and prove they are within quota without saying who they are. Cheat, and the deposit is forfeit.</p>
          <div className="actions">
            <Link href="/demo" className="btn primary">Watch a cheater get slashed <span className="arrow" aria-hidden="true">→</span></Link>
            <Link href="/docs#service" className="btn">Read the quickstart</Link>
          </div>
        </div>

        <div className="copy" aria-live="polite" style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? "auto" : "none" }}>
          <div className="stack">
            {SCENES.map((s, i) => (
              <div className="scene" key={s.name} data-on={on === i}>
                <h2 className="h2">{s.name}</h2>
                <p>{s.body}</p>
                <ul>{s.rows.map((r) => <li key={r[0]}><span>{r[0]}</span><span>{r[1]}</span></li>)}</ul>
              </div>
            ))}
          </div>
        </div>

        <div className="outro" data-on={on === 4}>
          <h2 className="h2">One line for the service. Five for the agent.</h2>
          <p>Drop in the middleware, set how many requests an hour, and pick which trust lists you accept.</p>
          <Link href="/service" className="btn primary">Open the service console <span className="arrow" aria-hidden="true">→</span></Link>
        </div>

        <nav className="rail" aria-label="Journey" style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? "auto" : "none" }}>
          {["Overview", "Stake", "Prove", "Check", "Slash"].map((n, i) => (
            <button key={n} onClick={() => jump(i - 1)} aria-current={on === i - 1 ? "true" : undefined}>{n}<i /></button>
          ))}
        </nav>
        {!ok && <p className="small" style={{ position: "absolute", right: 24, bottom: 24 }}>3D view needs WebGL.</p>}
      </div>
    </div>
  );
}
