"use client";
import { useLayoutEffect, useRef } from "react";
import { preload } from "react-dom";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import dynamic from "next/dynamic";
import { EARTH } from "./earth";

// the starfield (ogl + shader) loads after first paint, off the critical path
const Stars = dynamic(() => import("./Stars"), { ssr: false });

// The earth starts loading with the page: three.js begins downloading as soon as this module runs in the browser
// (in parallel with hydration), and the textures are preloaded from the document head (see Story below).
const globeModule = typeof window !== "undefined" ? import("./globe") : null;

gsap.registerPlugin(ScrollTrigger);

/* Request tickets for the wall: deterministic so server and client render the same markup. */
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const hx = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
const SVC = ["lantern-search", "tidewater-data", "atlas-mcp", "quarry-api", "harbor-tools", "ember-index"];
const COLS = 16, ROWS = 3;
const TICKETS = Array.from({ length: COLS * ROWS }, (_, i) => {
  const n = [100, 250, 40, 500][Math.floor(rnd() * 4)];
  return { i, r: Math.floor(i / COLS), c: i % COLS, svc: SVC[Math.floor(rnd() * SVC.length)], n, k: 1 + Math.floor(rnd() * (n - 1)), nul: `0x${hx(4)}…${hx(4)}`, ms: 3 + Math.floor(rnd() * 9), bad: i === 21 || i === 38 };
});

const Check = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M6.4 10.3l2.4 2.3 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/* The stake: a minted deposit coin. Front carries the mark, back the secret line a repeat would reveal.
   Metal sits under the moving sheen; the engraving sits above it (dark ink, bright bevel) so it reads on light and dark. */
function CoinMetal() {
  return (
    <svg className="st-metal" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="coin-metal" cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#f6f8f9" /><stop offset=".45" stopColor="#d3d7da" /><stop offset=".8" stopColor="#a9afb4" /><stop offset="1" stopColor="#c3c8cc" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#coin-metal)" />
    </svg>
  );
}
function CoinArt({ side }: { side: "front" | "back" }) {
  const id = `c-${side}`, ink = "#1c2023";
  return (
    <svg className="st-art" viewBox="0 0 200 200" aria-hidden="true">
      <defs><path id={`${id}-p`} d="M100 100 m-79 0 a79 79 0 1 1 158 0 a79 79 0 1 1 -158 0" /></defs>
      <circle cx="100" cy="100" r="94" fill="none" stroke={ink} strokeOpacity=".55" strokeWidth="1.4" />
      <circle cx="100" cy="100" r="90" fill="none" stroke={ink} strokeOpacity=".6" strokeWidth="1.6" strokeDasharray="0.1 3.4" strokeLinecap="round" />
      <circle cx="100" cy="100" r="68" fill="none" stroke={ink} strokeOpacity=".45" strokeWidth="1.2" />
      <text fontSize="10.5" letterSpacing="2.4" fill={ink} style={{ fontFamily: "var(--f-mono)", fontWeight: 700 }}>
        <textPath href={`#${id}-p`}>{side === "front" ? "QUOTA · DEPOSIT-BACKED RATE LIMITS · MONAD · " : "ONE POINT IS NOISE · TWO POINTS ARE THE KEY · "}</textPath>
      </text>
      {side === "front" ? (
        <g>
          <circle cx="100" cy="92" r="26" fill="none" stroke={ink} strokeWidth="8.5" />
          <rect x="57" y="87" width="86" height="10" rx="1.2" fill={ink} />
          <text x="100" y="146" textAnchor="middle" fontSize="15" letterSpacing="3" fill={ink} style={{ fontFamily: "var(--f-mono)", fontWeight: 700 }}>10 MON</text>
        </g>
      ) : (
        <g>
          {[64, 82, 100, 118, 136].map((v) => <line key={"v" + v} x1={v} y1="56" x2={v} y2="144" stroke={ink} strokeOpacity=".3" strokeWidth="1" />)}
          {[64, 82, 100, 118, 136].map((v) => <line key={"h" + v} x1="56" y1={v} x2="144" y2={v} stroke={ink} strokeOpacity=".3" strokeWidth="1" />)}
          {[-1.1, -0.15, 0.4].map((m) => <line key={m} x1="56" y1={108 - 30 * m} x2="144" y2={108 + 58 * m} stroke={ink} strokeOpacity=".55" strokeWidth="1.3" strokeDasharray="3 3" />)}
          <line x1="56" y1="125.4" x2="144" y2="74.5" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="86" cy="108" r="6" fill={ink} /><circle cx="124" cy="86" r="6" fill={ink} />
          <text x="100" y="164" textAnchor="middle" fontSize="12.5" letterSpacing="2" fill={ink} style={{ fontFamily: "var(--f-mono)", fontWeight: 700 }}>k = 7 / 100</text>
        </g>
      )}
    </svg>
  );
}

export default function Story() {
  // emitted into <head> during server render: the browser fetches the earth with the HTML, before any JS runs.
  // "fetch" + anonymous matches how ImageBitmapLoader requests them, so the preloaded response is reused.
  Object.values(EARTH.low).forEach((href) => preload(href, { as: "fetch", crossOrigin: "anonymous", fetchPriority: "high" }));
  Object.values(EARTH.high).forEach((href) => preload(href, { as: "fetch", crossOrigin: "anonymous" }));
  const root = useRef<HTMLDivElement>(null);
  const starsOn = useRef(true); // the starfield stops drawing once it has faded out
  const quality = useRef(0); // 0 full, 1 and 2 cheaper; only ever stepped down, so it cannot flicker

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let globe: { set: (v: { dim?: number; spin?: number }) => void; resize: () => void; weak: boolean; quality: (l: number) => void; dispose: () => void } | null = null;
    let dead = false;
    let tlRef: gsap.core.Timeline | null = null; // read by the late-loading globe to start in the right state
    let governRef: ((t: number, dt: number) => void) | null = null;
    let warmId = 0;
    try { quality.current = Math.min(2, Number(sessionStorage.getItem("quota:q")) || 0); } catch { /* ignore */ }

    const ctx = gsap.context(() => {
      const coin = q(".st-coin")[0], cyl = q(".st-cyl")[0] as HTMLElement, wall = q(".st-wall")[0] as HTMLElement;
      const tiles = q(".st-tile") as HTMLElement[];
      const edge = q(".st-edge")[0] as HTMLElement;
      const gl = { dim: 1, spin: 0 };
      const cylS = { ry: 38, y: 0 };
      const shine = { extra: 0 };
      const op = new Float32Array(tiles.length).fill(-1);

      /* inside of a cylinder: the far wall faces the viewer, side columns turn inward */
      const layout = () => {
        const W = window.innerWidth, small = W < 760;
        const R = W * (small ? 1.15 : 0.75);
        wall.style.setProperty("--persp", `${R * 1.42}px`);
        cyl.style.setProperty("--R", `${R}px`);
        cyl.style.setProperty("--tw", `${W * (small ? 0.3 : 0.135)}px`);
      };
      const paintWall = () => {
        cyl.style.transform = `translate3d(0, ${cylS.y}px, 0) rotateX(-4deg) rotateY(${cylS.ry}deg)`;
        for (let i = 0; i < tiles.length; i++) {
          const a = (tiles[i].dataset.a as unknown as number) * 1;
          const c = Math.cos(((a + cylS.ry) * Math.PI) / 180);
          const o = Math.round(Math.min(1, Math.max(0, (c - 0.08) / 0.4)) * 20) / 20; // quantised: only write on real change
          if (o !== op[i]) { op[i] = o; tiles[i].style.opacity = String(o); tiles[i].style.visibility = o > 0 ? "visible" : "hidden"; }
        }
      };
      const setFront = gsap.quickSetter(q(".st-face--front .st-sheen"), "xPercent");
      const setBack = gsap.quickSetter(q(".st-face--back .st-sheen"), "xPercent");
      const paintCoin = () => {
        const r = ((gsap.getProperty(coin, "rotationY") as number) * Math.PI) / 180;
        const x = -22 + Math.sin(r) * 20 + shine.extra; // light sweeps across the face as it turns
        setFront(x); setBack(x - 14);
        edge.style.opacity = String(Math.max(0, 1 - Math.abs(Math.cos(r)) * 5)); // the rim strip only exists edge-on
      };
      layout(); paintWall(); paintCoin();

      gsap.set(".st-globe", { xPercent: -50, yPercent: -8.33 });
      gsap.set(".st-hero", { yPercent: -50 });
      gsap.set(coin, { rotationY: -270, rotationX: 8, rotationZ: -4 });

      if (!calm) {
        gsap.timeline({ defaults: { ease: "expo.out" } })
          .from(".st-hero h1 .ln > span", { yPercent: 108, duration: 1.4, stagger: 0.09 }, 0.15)
          .from(".st-hero p, .st-hero .st-actions", { autoAlpha: 0, y: 18, duration: 1.3, stagger: 0.08 }, 0.45)
          .from(".st-stars", { autoAlpha: 0, duration: 2.4, ease: "power2.out" }, 0)
          .from(".st-globe-rise", { y: "28vh", autoAlpha: 0, duration: 2.4, ease: "power3.out" }, 0.2)
          .from(".st-chip", { autoAlpha: 0, y: 14, scale: 0.92, duration: 1, stagger: 0.14, ease: "power3.out" }, 1.3);
        q(".st-chip").forEach((c, i) => gsap.to(c, { yPercent: -18, duration: 2.6 + i * 0.5, ease: "sine.inOut", yoyo: true, repeat: -1, delay: i * 0.4 }));
      }

      const vh = (v: number) => () => (window.innerHeight * v) / 100;
      // paint on the timeline's own update, so the scrubbed (smoothed) state is what reaches the screen
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        onUpdate: () => { paintWall(); paintCoin(); globe?.set(gl); starsOn.current = tl.time() < 4; },
        scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: true, // Lenis already smooths; a second scrub lag felt sticky
          invalidateOnRefresh: true, onRefresh: () => { layout(); paintWall(); } },
      });
      tlRef = tl;

      /* Quality governor. Average the real frame time while the scene is on screen (idle or scrolling, after the first
         2.5 s of loading); two slow windows in a row (under ~43 fps) step the quality down one level for this session.
         Strong GPUs never trip it, and it never steps back up, so it cannot flicker. */
      const born = performance.now();
      let acc = 0, n = 0, slow = 0;
      const govern = (_t: number, dt: number) => {
        if (document.hidden || dt > 120 || performance.now() - born < 2500 || tl.progress() > 0.97) { acc = 0; n = 0; return; }
        acc += dt; n++;
        if (n < 24) return;
        slow = acc / n > 23 ? slow + 1 : 0; acc = 0; n = 0;
        if (slow >= 2 && quality.current < 2) {
          slow = 0; quality.current++; globe?.quality(quality.current);
          try { sessionStorage.setItem("quota:q", String(quality.current)); } catch { /* private mode: it just re-measures */ }
        }
      };
      /* Pre-raster. The coin and the ticket wall start hidden, and the browser never paints what is hidden, so their first
         reveal mid-scroll costs a 100-250 ms stall. Paint them once, at 1% opacity for two frames, while the page is idle. */
      warmId = window.setTimeout(() => {
        if (tl.progress() > 0.2) return;
        const els = [wall, q(".st-coin-wrap")[0] as HTMLElement];
        const prev = els.map((e) => [e.style.opacity, e.style.visibility]);
        els.forEach((e) => { e.style.visibility = "visible"; e.style.opacity = "0.012"; });
        requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((e, i) => { e.style.opacity = prev[i][0]; e.style.visibility = prev[i][1]; })));
      }, 3200);
      gsap.ticker.add(govern);
      governRef = govern;
      const hero = q(".st-hero")[0] as HTMLElement;
      tl
        // 1. copy lifts, the earth rises into frame
        .fromTo(hero, { y: 0 }, { y: () => -(window.innerHeight * 0.5 - hero.offsetHeight * 0.5 - window.innerHeight * 0.1), duration: 1.2, ease: "power1.inOut" }, 0)
        .fromTo(".st-globe", { y: vh(36) }, { y: 0, duration: 1.2, ease: "power1.inOut" }, 0)
        .to(gl, { spin: 0.35, duration: 4.2 }, 0)
        // 2. copy leaves with parallax, the earth sinks into the dark
        .to(".st-hero h1", { y: vh(-72), duration: 1.3 }, 2.1)
        .to(".st-hero p", { y: vh(-66), duration: 1.3 }, 2.15)
        .to(".st-hero .st-actions", { y: vh(-58), duration: 1.3 }, 2.2)
        .to(".st-globe", { y: vh(16), scale: 0.93, duration: 1.8, ease: "power1.in" }, 2.5)
        .to(gl, { dim: 0, duration: 1.4, ease: "power1.in" }, 2.8)
        .to(".st-stars", { autoAlpha: 0, duration: 1.2 }, 2.7)
        .to(".st-globe", { autoAlpha: 0, duration: 0.2 }, 4.2)
        .to(".st-chip--a", { autoAlpha: 0, duration: 0.45 }, 2.6)
        .to(".st-chip--c", { autoAlpha: 0, duration: 0.45 }, 3.0)
        .to(".st-chip--b", { autoAlpha: 0, duration: 0.45 }, 3.5)
        // 3. a hairline of light: the stake, edge-on, unfolds
        .fromTo(".st-coin-wrap", { autoAlpha: 0, y: vh(14), scaleY: 0.5 }, { autoAlpha: 1, y: 0, scaleY: 1, duration: 1, ease: "power2.out" }, 3.6)
        .fromTo(".st-cap--1", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" }, 4.2)
        .to(coin, { rotationY: -196, rotationX: 6, rotationZ: 5, duration: 1.3, ease: "power2.inOut" }, 4.5)
        .to(".st-cap--1", { autoAlpha: 0, y: -16, duration: 0.5 }, 5.6)
        // 4. the wall of requests wraps around while the coin turns edge-on again
        .fromTo(wall, { autoAlpha: 0, scale: 0.82 }, { autoAlpha: 1, scale: 1, duration: 1.6, ease: "power2.out" }, 5.0)
        .to(cylS, { ry: -26, duration: 4.4, ease: "power1.inOut" }, 5.0)
        .fromTo(".st-cap--2", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" }, 6.0)
        .to(coin, { rotationY: -90, rotationX: 2, rotationZ: 0, duration: 1.2, ease: "power2.inOut" }, 5.9)
        .to(".st-cap--2", { autoAlpha: 0, y: -16, duration: 0.5 }, 7.3)
        // 5. the face of the stake
        .to(coin, { rotationY: -14, rotationX: 6, rotationZ: -2, duration: 1.4, ease: "power3.out" }, 7.4)
        .to(shine, { extra: -4, duration: 2.6 }, 7.6)
        // 6. the line that closes the scene
        .to(".st-coin-wrap", { y: vh(-4), duration: 1.2, ease: "power2.inOut" }, 8.5)
        .to(cylS, { y: () => -window.innerHeight * 0.05, duration: 1.2, ease: "power2.inOut" }, 8.5)
        .fromTo(".st-outro h2", { opacity: 0, y: 26, filter: "blur(12px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 1, ease: "power2.out" }, 8.6)
        .fromTo(".st-outro .st-actions", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" }, 8.9)
        .to({}, { duration: 0.9 });

      if (!calm) {
        const tx = gsap.quickTo(".st-coin-tilt", "rotationY", { duration: 1.2, ease: "power3.out" });
        const ty = gsap.quickTo(".st-coin-tilt", "rotationX", { duration: 1.2, ease: "power3.out" });
        const move = (e: PointerEvent) => { tx((e.clientX / window.innerWidth - 0.5) * 12); ty((e.clientY / window.innerHeight - 0.5) * -9); };
        window.addEventListener("pointermove", move);
        return () => window.removeEventListener("pointermove", move);
      }
    }, el);

    // the globe module was requested at page start; create it the moment it lands. The page works without it.
    void (globeModule ?? import("./globe")).then(({ createGlobe }) => {
      if (dead) return;
      try { globe = createGlobe(el.querySelector(".st-globe canvas") as HTMLCanvasElement); if (globe.weak && quality.current < 1) quality.current = 1; globe.quality(quality.current); globe.set({ dim: (tlRef?.time() ?? 0) < 4.2 ? 1 : 0 }); } catch { /* no WebGL: the copy still reads */ }
    });
    const onResize = () => globe?.resize();
    window.addEventListener("resize", onResize);
    return () => { dead = true; window.removeEventListener("resize", onResize); if (governRef) gsap.ticker.remove(governRef); window.clearTimeout(warmId); ctx.revert(); globe?.dispose(); };
  }, []);

  return (
    <section className="st" ref={root} aria-label="How QUOTA works">
      <div className="st-stage">
        <div className="st-stars" aria-hidden="true">
          <Stars run={starsOn} />
        </div>
        <div className="st-wall" aria-hidden="true">
          <div className="st-cyl">
            {TICKETS.map((t) => (
              <div key={t.i} className={`st-tile r${t.r}` + (t.bad ? " bad" : "")} data-a={t.c * (360 / COLS) + (t.r === 1 ? 360 / COLS / 2 : 0)} style={{ "--a": t.c * (360 / COLS) + (t.r === 1 ? 360 / COLS / 2 : 0), "--row": t.r } as React.CSSProperties}>
                <span className="t-top"><i />{t.bad ? "Violation" : "Proof verified"}</span>
                <b className="t-k">{t.k}<small>/{t.n}</small></b>
                <span className="t-svc">{t.svc}</span>
                <span className="t-nul">{t.nul}</span>
                <span className="t-who">{t.bad ? "key recovered, slashed" : `caller unknown · ${t.ms} ms`}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="st-globe">
          <div className="st-globe-rise">
            <canvas aria-hidden="true" />
            <div className="st-chip st-chip--a"><Check />Proof verified</div>
            <div className="st-chip st-chip--b"><Check />Request 41 of 100</div>
            <div className="st-chip st-chip--c"><Check />Caller unknown</div>
          </div>
        </div>

        <div className="st-hero">
          <h1><span className="ln"><span>Rate limits</span></span><span className="ln"><span>that keep no record</span></span></h1>
          <p>Agents lock a deposit and prove they are within quota{"\n"}without saying who they are. Cheat, and the deposit is forfeit.</p>
          <div className="st-actions">
            <Link href="/demo" className="btn primary">Watch a cheater get slashed</Link>
            <Link href="/docs#service" className="btn">Read the quickstart</Link>
          </div>
        </div>

        <div className="st-coin-wrap" role="img" aria-label="A stake coin turning: one side shows the QUOTA mark, the other a line through two points.">
          <div className="st-coin-tilt">
            <div className="st-coin">
              <div className="st-edge" />
              {[-3, -2, -1, 0, 1, 2, 3].map((z) => <div key={z} className="st-rim" style={{ transform: `translateZ(${z}px)` }} />)}
              <div className="st-face st-face--front"><CoinMetal /><div className="st-sheen" /><CoinArt side="front" /></div>
              <div className="st-face st-face--back"><CoinMetal /><div className="st-sheen" /><CoinArt side="back" /></div>
            </div>
          </div>
        </div>

        <p className="st-cap st-cap--1"><b>Stake once, with a tap.</b>An operator locks a deposit with a passkey. Allowance scales with it, so splitting it gains nothing.</p>
        <p className="st-cap st-cap--2"><b>Every request, unlinkable.</b>Each call carries a zero-knowledge proof: a staked member, request k of N. Never which member.</p>

        <div className="st-outro">
          <h2>One deposit.<br />No record of who called.</h2>
          <div className="st-actions"><Link href="/operator" className="btn primary">Stake an agent</Link></div>
        </div>
      </div>
    </section>
  );
}
