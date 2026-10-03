"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* The world is a single transit line drawn in code. Scroll drives a camera along it:
   overview -> dive into a station -> pull up -> fly to the next. No cuts, one continuous move. */
const P: [number, number][] = [[-700, 3200], [900, 3200], [1700, 2400], [3000, 2400], [3800, 1600], [5100, 1600], [5900, 800], [7400, 800]];
const SEG = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]));
const CUM = SEG.reduce<number[]>((a, l) => [...a, a[a.length - 1] + l], [0]);
const TOTAL = CUM[CUM.length - 1];
const pathPt = (u: number): [number, number] => {
  const c = Math.max(0, Math.min(TOTAL, u));
  let i = 0;
  while (i < SEG.length - 1 && c > CUM[i + 1]) i++;
  const t = (c - CUM[i]) / SEG[i];
  return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t];
};
const D = P.map((p) => `${p[0]},${p[1]}`).join(" ");
const STATIONS = [
  { id: "stake", name: "STAKE", x: 500, y: 3200, u: CUM[0] + 500 + 700 },
  { id: "prove", name: "PROVE", x: 2350, y: 2400, u: CUM[2] + 650 },
  { id: "check", name: "CHECK", x: 4450, y: 1600, u: CUM[4] + 650 },
  { id: "slash", name: "SLASH", x: 6650, y: 800, u: CUM[6] + 750 },
];
const LIFT = 345; // vignette centre sits this far above the line
const OV = { x: 3350, y: 1900 };
const U_START = 260;

const SCENES = [
  { name: "Stake once, with a tap.", body: "An operator locks a deposit with a passkey and the agent joins a public list of staked members. Allowance scales with the deposit, so splitting it gains nothing.", rows: [["Custody", "Passkey, checked on-chain"], ["Allowance", "Linear in stake"]] },
  { name: "Prove it's within quota.", body: "Every request carries a zero-knowledge proof: a staked member, request k of N this epoch. It never says which member.", rows: [["Circuit", "RLN-v2, audited and reused"], ["Scope", "Quotas are per server"]] },
  { name: "Verified. Linked to no one.", body: "The service checks the proof off-chain and learns nothing about who sent it. Two requests cannot be tied together.", rows: [["Check", "Off-chain, milliseconds"], ["Memory", "One line per nullifier"]] },
  { name: "Cheat once, forfeit the deposit.", body: "Reusing a request number leaks the agent's secret key. Anyone holding it can claim the stake, through a commit then reveal so the claim can't be copied.", rows: [["Claim path", "Commit, then reveal"], ["Payout", "Slasher paid, rest burned"]] },
];

// timeline, in abstract units
const T = { dive: [6, 15], hold: [[15, 26], [40, 51], [65, 76], [90, 101]], hop: [[26, 40], [51, 65], [76, 90]], out: [101, 112], end: 120 };

function Ink({ children }: { children: React.ReactNode }) { return <g fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">{children}</g>; }
const mono = { fontFamily: "var(--f-mono)" } as const;

function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <g>
      <line x1="0" y1="-130" x2="0" y2="-20" stroke="var(--ink)" strokeWidth="8" />
      <rect x="-430" y="-560" width="860" height="430" rx="8" fill="var(--paper)" stroke="var(--ink)" strokeWidth="6" />
      {children}
      <text x="70" y="-44" fontSize="92" fontWeight="800" style={{ fontFamily: "var(--f-sans)", fontStretch: "112%", letterSpacing: "-0.03em" }} fill="var(--ink)">{label}</text>
    </g>
  );
}

function StakeArt() {
  return (
    <Panel label="STAKE">
      <rect x="-380" y="-510" width="190" height="340" rx="16" fill="var(--ink)" />
      <rect x="-360" y="-490" width="150" height="150" rx="8" fill="#1b2631" />
      {[34, 52, 70].map((r, i) => <path key={r} d={`M ${-285 - r} -405 a ${r} ${r} 0 0 1 ${2 * r} 0`} fill="none" stroke="var(--leaf)" strokeWidth="7" strokeLinecap="round" opacity={1 - i * 0.2} />)}
      <circle cx="-285" cy="-405" r="9" fill="var(--leaf)" />
      <text x="-285" y="-362" textAnchor="middle" fontSize="26" fontWeight="700" fill="#e8edf1" style={mono}>TAP</text>
      <rect x="-360" y="-320" width="150" height="20" rx="4" fill="#33414f" />
      <rect x="-345" y="-270" width="120" height="14" rx="4" fill="#33414f" />
      <Ink><path d="M -150 -340 H 10" /><path d="M -22 -368 L 10 -340 L -22 -312" /></Ink>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <ellipse cx="190" cy={-200 - i * 32} rx="104" ry="30" fill="var(--amber)" stroke="var(--ink)" strokeWidth="6" />
          <rect x="86" y={-200 - i * 32} width="208" height="12" fill="var(--amber)" />
        </g>
      ))}
      <ellipse cx="190" cy={-200 - 4 * 32} rx="104" ry="30" fill="var(--amber)" stroke="var(--ink)" strokeWidth="6" />
      <text x="190" y="-480" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--ink)" style={mono}>10 MON</text>
      <text x="190" y="-446" textAnchor="middle" fontSize="22" fill="var(--ink-2)" style={mono}>limit 100 / epoch</text>
    </Panel>
  );
}

function ProveArt() {
  return (
    <Panel label="PROVE">
      <defs>
        <pattern id="hatch" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="22" stroke="var(--ink-3)" strokeWidth="5" /></pattern>
      </defs>
      <circle cx="-250" cy="-345" r="118" fill="var(--ground)" stroke="var(--ink)" strokeWidth="6" />
      <circle cx="-250" cy="-390" r="40" fill="var(--ink-3)" />
      <path d="M -330 -260 q 0 -70 80 -70 q 80 0 80 70 z" fill="var(--ink-3)" />
      <circle cx="-250" cy="-345" r="118" fill="url(#hatch)" stroke="var(--ink)" strokeWidth="6" />
      <text x="-250" y="-190" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--ink)" style={mono}>member: ?</text>
      <Ink><path d="M -110 -345 H 0" /><path d="M -30 -373 L 0 -345 L -30 -317" /></Ink>
      <path d="M 40 -500 H 390 V -420 a 22 22 0 0 0 0 44 V -250 H 40 V -376 a 22 22 0 0 0 0 -44 z" fill="#fff" stroke="var(--ink)" strokeWidth="6" />
      <line x1="40" y1="-398" x2="390" y2="-398" stroke="var(--ink)" strokeWidth="4" strokeDasharray="10 12" />
      <text x="68" y="-448" fontSize="34" fontWeight="700" fill="var(--cobalt-ink)" style={mono}>request k = 7</text>
      <text x="68" y="-414" fontSize="22" fill="var(--ink-2)" style={mono}>of N = 100 this epoch</text>
      <text x="68" y="-354" fontSize="22" fill="var(--ink)" style={mono}>share (x₇, y₇)</text>
      <text x="68" y="-322" fontSize="22" fill="var(--ink-2)" style={mono}>π 0x4e9a…c1d7</text>
      <rect x="68" y="-290" width="150" height="16" rx="3" fill="var(--cobalt)" />
    </Panel>
  );
}

function CheckArt() {
  return (
    <Panel label="CHECK">
      {[[-380, -500, "0x91c2…07fe", "k = 3"], [-380, -330, "0x3ae7…b2d9", "k = 41"]].map(([x, y, id, k]) => (
        <g key={String(id)}>
          <rect x={x as number} y={y as number} width="230" height="120" rx="6" fill="#fff" stroke="var(--ink)" strokeWidth="6" />
          <text x={(x as number) + 20} y={(y as number) + 52} fontSize="24" fontWeight="700" fill="var(--ink)" style={mono}>{id}</text>
          <text x={(x as number) + 20} y={(y as number) + 88} fontSize="22" fill="var(--ink-2)" style={mono}>{k}</text>
        </g>
      ))}
      <Ink><path d="M -150 -440 C -90 -440 -90 -340 -150 -340" strokeDasharray="4 14" /></Ink>
      <text x="-100" y="-380" fontSize="44" fontWeight="800" fill="var(--signal-ink)" style={{ fontFamily: "var(--f-sans)" }}>?</text>
      <text x="-380" y="-190" fontSize="22" fill="var(--ink-2)" style={mono}>same sender? cannot tell.</text>
      <Ink><path d="M -20 -330 H 70" /><path d="M 44 -358 L 72 -330 L 44 -302" /></Ink>
      <rect x="110" y="-510" width="290" height="330" rx="8" fill="var(--ink)" />
      <circle cx="255" cy="-400" r="58" fill="none" stroke="var(--leaf)" strokeWidth="12" />
      <path d="M 226 -400 L 248 -376 L 288 -428" fill="none" stroke="var(--leaf)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <text x="255" y="-290" textAnchor="middle" fontSize="34" fontWeight="700" fill="#e8edf1" style={mono}>VERIFIED</text>
      <text x="255" y="-250" textAnchor="middle" fontSize="24" fill="#9aa7b3" style={mono}>4 ms · who: unknown</text>
      <text x="255" y="-214" textAnchor="middle" fontSize="20" fill="#6f7d8a" style={mono}>demo timing</text>
    </Panel>
  );
}

function SlashArt() {
  // two shares on one line: secret recovered
  const X = (x: number) => -380 + x * 2.0, Y = (y: number) => -170 - y * 2.0;
  return (
    <Panel label="SLASH">
      <rect x="-390" y="-520" width="410" height="340" rx="6" fill="#fff" stroke="var(--rule)" strokeWidth="4" />
      {[1, 2, 3].map((i) => <line key={i} x1={-390 + i * 102} y1="-520" x2={-390 + i * 102} y2="-180" stroke="var(--rule-2)" strokeWidth="3" />)}
      {[1, 2, 3].map((i) => <line key={i} x1="-390" y1={-520 + i * 85} x2="20" y2={-520 + i * 85} stroke="var(--rule-2)" strokeWidth="3" />)}
      <line x1={X(5)} y1={Y(18)} x2={X(190)} y2={Y(160)} stroke="var(--signal)" strokeWidth="9" strokeLinecap="round" />
      <circle cx={X(55)} cy={Y(56)} r="15" fill="var(--ink)" /><circle cx={X(130)} cy={Y(114)} r="15" fill="var(--ink)" />
      <circle cx={X(5)} cy={Y(18)} r="17" fill="var(--paper)" stroke="var(--signal-ink)" strokeWidth="7" />
      <text x="-370" y="-488" fontSize="22" fill="var(--ink-2)" style={mono}>two points, one request number</text>
      <text x={X(5) + 26} y={Y(18) - 16} fontSize="26" fontWeight="700" fill="var(--signal-ink)" style={mono}>a₀</text>
      <Ink><path d="M 50 -345 H 130" /><path d="M 104 -373 L 132 -345 L 104 -317" /></Ink>
      <rect x="170" y="-510" width="230" height="150" rx="8" fill="var(--signal)" />
      <text x="285" y="-448" textAnchor="middle" fontSize="28" fontWeight="700" fill="#fff" style={mono}>secret</text>
      <text x="285" y="-408" textAnchor="middle" fontSize="28" fontWeight="700" fill="#fff" style={mono}>recovered</text>
      {[0, 1, 2].map((i) => <ellipse key={i} cx="285" cy={-260 - i * 22} rx="80" ry="22" fill="var(--amber)" stroke="var(--ink)" strokeWidth="6" />)}
      <text x="285" y="-186" textAnchor="middle" fontSize="22" fill="var(--ink)" style={mono}>stake → slasher</text>
    </Panel>
  );
}

const ARTS = [StakeArt, ProveArt, CheckArt, SlashArt];

function blocks() {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let x = -900; x < 7700; x += 250) for (let y = 300; y < 3600; y += 250) {
    const w = 120 + rnd() * 100, h = 120 + rnd() * 100, bx = x + rnd() * 20, by = y + rnd() * 20;
    // keep a clear corridor around the line and out of vignette footprints
    let near = false;
    for (let i = 0; i < P.length - 1 && !near; i++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const px = P[i][0] + (P[i + 1][0] - P[i][0]) * t, py = P[i][1] + (P[i + 1][1] - P[i][1]) * t;
        if (Math.abs(px - (bx + w / 2)) < 150 && Math.abs(py - (by + h / 2)) < 150) { near = true; break; }
      }
    }
    if (!near && rnd() > 0.28) out.push({ x: bx, y: by, w, h });
  }
  return out;
}
const BLOCKS = blocks();

export default function World() {
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [on, setOn] = useState(-1); // -1 hero, 0-3 stations, 4 outro
  const jump = useRef<(i: number) => void>(() => {});

  useEffect(() => {
    const el = root.current, map = svg.current;
    if (!el || !map) return;
    const world = map.querySelector<SVGGElement>("#world")!;
    const train = map.querySelector<SVGGElement>("#train")!;
    const trace = map.querySelector<SVGPolylineElement>("#trace")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cam = { u: U_START, k: 0 };

    const draw = () => {
      const vw = el.clientWidth, vh = el.clientHeight, wide = vw > 860;
      const sO = wide ? Math.min((0.94 * vw) / 8100, (0.66 * vh) / 3000) : Math.max(0.05, (0.96 * vw) / 8100);
      const sD = wide ? Math.min((0.5 * vw) / 860, (0.78 * vh) / 430) : (0.92 * vw) / 860;
      const k = cam.k, s = sO * Math.pow(sD / sO, k);
      const pt = pathPt(cam.u);
      const cx = OV.x + (pt[0] - OV.x) * k, cy = OV.y + (pt[1] - LIFT * k - OV.y) * k;
      const ax = vw * ((wide ? 0.5 : 0.5) + (wide ? 0.12 : 0) * k), ay = vh * ((wide ? 0.62 : 0.76) + ((wide ? 0.52 : 0.3) - (wide ? 0.62 : 0.76)) * k);
      world.setAttribute("transform", `translate(${ax - cx * s} ${ay - cy * s}) scale(${s})`);
      train.setAttribute("transform", `translate(${pt[0]} ${pt[1]})`);
      trace.setAttribute("stroke-dasharray", `${cam.u} ${TOTAL}`);
    };

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: reduce ? "none" : "power2.inOut" }, onUpdate: draw });
      tl.to(cam, { k: 1, u: STATIONS[0].u, duration: T.dive[1] - T.dive[0] }, T.dive[0]);
      STATIONS.slice(1).forEach((s, i) => {
        const [a, b] = T.hop[i], mid = a + (b - a) / 2;
        tl.to(cam, { u: s.u, duration: b - a }, a);
        if (!reduce) {
          tl.to(cam, { k: 0.3, duration: mid - a, ease: "power2.out" }, a);
          tl.to(cam, { k: 1, duration: b - mid, ease: "power2.in" }, mid);
        }
      });
      tl.to(cam, { k: 0, duration: T.out[1] - T.out[0] }, T.out[0]);
      tl.set({}, {}, T.end);
      const vh = () => el.clientHeight;
      const st = ScrollTrigger.create({
        trigger: el, start: "top top", end: () => `+=${Math.round(vh() * 9)}`, pin: true, scrub: reduce ? true : 0.7, animation: tl, invalidateOnRefresh: true,
        onUpdate: (self) => {
          const t = self.progress * T.end;
          setOn(t < 5.5 ? -1 : t >= 108 ? 4 : t < 33 ? 0 : t < 58 ? 1 : t < 83 ? 2 : 3);
        },
      });
      jump.current = (i) => {
        const t = i < 0 ? 0 : i > 3 ? T.end : T.hold[i][0] + 3;
        window.scrollTo({ top: st.start + (t / T.end) * (st.end - st.start), behavior: reduce ? "auto" : "smooth" });
      };
      draw();
    }, root);
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); ctx.revert(); };
  }, []);

  return (
    <div className="world" ref={root}>
      <svg ref={svg} className="map" role="img" aria-label="A transit line with four stations: Stake, Prove, Check and Slash.">
        <g id="world">
          {BLOCKS.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--rule-2)" />)}
          <polyline points={D} fill="none" stroke="var(--rule)" strokeWidth="64" strokeLinejoin="round" strokeLinecap="round" />
          <polyline id="trace" points={D} fill="none" stroke="var(--cobalt)" strokeWidth="64" strokeLinejoin="round" strokeLinecap="butt" strokeDasharray={`${U_START} ${TOTAL}`} />
          {STATIONS.map((s, i) => {
            const Art = ARTS[i];
            return (
              <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
                <Art />
                <circle r="46" fill="#fff" stroke="var(--ink)" strokeWidth="14" />
              </g>
            );
          })}
          <g id="train">
            <circle r="30" fill="none" stroke="var(--cobalt)" strokeWidth="12" />
            <rect x="-40" y="-8" width="80" height="16" fill="var(--ink)" />
          </g>
        </g>
      </svg>

      <div className="hero" style={{ opacity: on === -1 ? 1 : 0, transform: on === -1 ? "none" : "translateY(-12px)", pointerEvents: on === -1 ? "auto" : "none" }}>
        <h1 className="display">Rate limits that keep no record.</h1>
        <p className="lede">Agents lock a deposit and prove they are within quota without saying who they are. Cheat, and the deposit is forfeit.</p>
        <div className="actions">
          <Link href="/demo" className="btn primary">Watch a cheater get slashed <span className="arrow" aria-hidden="true">→</span></Link>
          <Link href="/docs#service" className="btn">Read the quickstart</Link>
        </div>
      </div>

      <div className="copy" aria-live="polite" style={{ opacity: on >= 0 && on <= 3 ? 1 : 0, pointerEvents: on >= 0 && on <= 3 ? "auto" : "none" }}>
        <div style={{ position: "relative", minHeight: 300 }}>
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

      <nav className="rail" aria-label="Journey" style={{ opacity: on >= 0 && on <= 3 ? 1 : 0, pointerEvents: on >= 0 && on <= 3 ? "auto" : "none", transition: "opacity 300ms var(--ease)" }}>
        {["Overview", "Stake", "Prove", "Check", "Slash"].map((n, i) => (
          <button key={n} onClick={() => jump.current(i - 1)} aria-current={on === i - 1 ? "true" : undefined}>
            {n}<i />
          </button>
        ))}
      </nav>
    </div>
  );
}
