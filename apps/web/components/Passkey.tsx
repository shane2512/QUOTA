"use client";
import { useEffect, useRef, useState } from "react";

/* Demo passkey prompt. The real flow is a WebAuthn assertion verified on-chain via P256VERIFY. */
export default function Passkey({ action, onClose, onDone }: { action: string | null; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (action && !d.open) d.showModal();
    if (!action && d.open) d.close();
    setBusy(false);
  }, [action]);
  const tap = () => { setBusy(true); setTimeout(() => { setBusy(false); onDone(); }, 900); };
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="pk-title">
      <h2 id="pk-title">Confirm with your passkey</h2>
      <p className="small">{action}</p>
      <div className="tap" aria-hidden="true">
        <svg viewBox="0 0 96 96">
          <circle className="ring" cx="48" cy="48" r="44" fill="none" stroke="var(--cobalt)" strokeWidth="4" />
          <circle cx="48" cy="48" r="26" fill="var(--ink)" />
          {[10, 16, 22].map((r) => <path key={r} d={`M ${48 - r} 52 a ${r} ${r} 0 0 1 ${2 * r} 0`} fill="none" stroke="var(--leaf)" strokeWidth="3" strokeLinecap="round" />)}
        </svg>
      </div>
      <p className="label">Demo: no credential is read. In production the signed payload binds chain, registry, operator, action, params and a nonce.</p>
      <div className="actions">
        <button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm primary" onClick={tap} disabled={busy}>{busy ? "Verifying…" : "Tap to confirm"}</button>
      </div>
    </dialog>
  );
}
