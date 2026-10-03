"use client";
import { useState } from "react";

// Secret line y = 0.62x + 2.4. The intercept (2.4) stands in for the agent's key a0.
const X = (x: number) => 60 + x * 55, Y = (y: number) => 360 - y * 32;
const A0 = 2.4, SLOPE = 0.62, P1 = 3, P2 = 7.5;
const yAt = (x: number) => A0 + SLOPE * x;
const decoys = [-0.15, 0.1, 0.34, 0.9, 1.15, 1.4].map((m) => ({ m, b: yAt(P1) - m * P1 }));

export default function Shamir({ compact = false }: { compact?: boolean }) {
  const [two, setTwo] = useState(false);
  return (
    <div className="shamir" style={compact ? { gridTemplateColumns: "1fr" } : undefined}>
      <div className="plane">
        <svg viewBox="0 0 640 400" role="img" aria-label={two ? "Two points define one line; its intercept is the secret key." : "One point lies on many possible lines; the secret stays hidden."}>
          <defs><clipPath id="clip"><rect x="60" y="40" width="550" height="320" /></clipPath></defs>
          {[0, 2, 4, 6, 8, 10].map((v) => <line key={"x" + v} x1={X(v)} y1="40" x2={X(v)} y2="360" stroke="var(--rule-2)" strokeWidth="1.5" />)}
          {[0, 2, 4, 6, 8, 10].map((v) => <line key={"y" + v} x1="60" y1={Y(v)} x2="610" y2={Y(v)} stroke="var(--rule-2)" strokeWidth="1.5" />)}
          <line x1="60" y1="40" x2="60" y2="360" stroke="var(--ink)" strokeWidth="2.5" />
          <line x1="60" y1="360" x2="610" y2="360" stroke="var(--ink)" strokeWidth="2.5" />
          <g clipPath="url(#clip)">
            {decoys.map((d) => (
              <line key={d.m} x1={X(0)} y1={Y(d.b)} x2={X(10)} y2={Y(d.b + d.m * 10)} stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="6 7"
                style={{ opacity: two ? 0 : 0.7, transition: "opacity 420ms var(--ease)" }} />
            ))}
            <line x1={X(0)} y1={Y(yAt(0))} x2={X(10)} y2={Y(yAt(10))} stroke="var(--signal)" strokeWidth="5" strokeLinecap="round"
              style={{ opacity: two ? 1 : 0, transition: "opacity 420ms var(--ease) 120ms" }} />
          </g>
          <circle cx={X(P1)} cy={Y(yAt(P1))} r="9" fill="var(--ink)" />
          <circle cx={X(P2)} cy={Y(yAt(P2))} r="9" fill="var(--ink)" style={{ opacity: two ? 1 : 0, transition: "opacity 320ms var(--ease)" }} />
          <text x={X(P1) + 14} y={Y(yAt(P1)) + 28} fontSize="14" fill="var(--ink)" style={{ fontFamily: "var(--f-mono)" }}>share 1</text>
          <g style={{ opacity: two ? 1 : 0, transition: "opacity 320ms var(--ease) 200ms" }}>
            <text x={X(P2) + 12} y={Y(yAt(P2)) + 28} fontSize="14" fill="var(--ink)" style={{ fontFamily: "var(--f-mono)" }}>share 2</text>
            <circle cx={X(0)} cy={Y(A0)} r="12" fill="var(--paper)" stroke="var(--signal-ink)" strokeWidth="5" />
            <text x={X(0) + 20} y={Y(A0) - 14} fontSize="18" fontWeight="700" fill="var(--signal-ink)" style={{ fontFamily: "var(--f-mono)" }}>a₀ = secret key</text>
          </g>
          <text x="610" y="388" textAnchor="end" fontSize="13" fill="var(--ink-2)" style={{ fontFamily: "var(--f-mono)" }}>message hash</text>
        </svg>
      </div>
      <div className="read">
        <div className="seg" role="group" aria-label="Choose a scenario">
          <button aria-pressed={!two} onClick={() => setTwo(false)}>Honest agent</button>
          <button aria-pressed={two} onClick={() => setTwo(true)}>Reuses request #7</button>
        </div>
        <div className={"status" + (two ? " bad" : "")} aria-live="polite">
          {two ? (
            <>
              <b>Two points name the line.</b>
              <p>Same request number, two different messages. The line&apos;s intercept is the agent&apos;s secret key, and anyone who sees both can claim its stake.</p>
              <code>a₀ = 0x7c1e…d09b (demo value)</code>
            </>
          ) : (
            <>
              <b>One point reveals nothing.</b>
              <p>Every line through it is equally likely. The service learns neither the key nor who is calling, and cannot link this request to another.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
