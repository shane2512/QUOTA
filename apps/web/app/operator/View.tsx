"use client";
import type { Address } from "viem";
import { EXPLORER, mon } from "@/lib/registry";

/* Presentation for the operator console. Operator.tsx owns auth, chain reads and passkey signing; this file only draws. */

export type Agent = { identity: number; idCommitment: string; state: number; mine: boolean; limit: number; stakeWei: string; unlockAt: number; destination: string };
export type Me = {
  operator: Address; chainId: number; registry: Address; balanceWei: string; unitWei: string; unstakeDelay: number; maxLimit: number; now: number;
  passkey: { registered: boolean; x: string; y: string; nonce: string };
  agents: Agent[];
};
export const GAS_BUDGET_WEI = 450_000_000_000_000_000n; // ~0.45 MON of gas headroom per enrollment (Monad bills the gas limit)

const STATE = ["free", "active", "unstaking", "withdrawn", "slashed"] as const;
const tone = (s: number) => (s === 1 ? "ok" : s === 4 ? "bad" : "wait");
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const Check = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 10.4l3 2.9 6-6.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function SignedOut({ onLogin, rpId }: { onLogin: () => void; rpId: string }) {
  return (
    <div className="wrap shell">
      <div className="op-gate">
        <div>
          <p className="label">Operator console</p>
          <h1 className="display">Stake for<br />your agents</h1>
          <p className="lede">Lock a deposit for each agent you run. Your agents then call any QUOTA service without an account, and nobody can tell which of them sent a request.</p>
          <div className="actions" style={{ marginTop: 32 }}>
            <button className="btn primary" onClick={onLogin}>Log in with email</button>
            <a className="btn" href="/docs#agent">Agent quickstart</a>
          </div>
          <p className="small" style={{ marginTop: 20 }}>Monad testnet. You need a little test MON, and passkeys only work on {rpId}.</p>
        </div>
        <ol className="op-howto panel" aria-label="How staking works">
          <li><span>1</span><div><b>Log in</b><p>Creates your operator wallet. It stays on our server; you never handle a key.</p></div></li>
          <li><span>2</span><div><b>Register a passkey</b><p>Touch ID, Windows Hello or your phone. It must approve every stake change on-chain, so a leaked agent key cannot move your deposit.</p></div></li>
          <li><span>3</span><div><b>Enroll an agent</b><p>Choose requests per epoch; the stake scales with it. Cheat once and the deposit is forfeit.</p></div></li>
        </ol>
      </div>
    </div>
  );
}

export type DashboardProps = {
  me: Me | null; email?: string; busy: string; error: string; done: { label: string; hash: string } | null;
  wrongSite: boolean; noPasskeys: boolean; rpId: string; localPasskey: boolean;
  limit: number; setLimit: (n: number) => void; dest: string; setDest: (s: string) => void; copied: boolean; onCopy: () => void;
  onLogout: () => void; onRegister: () => void; onEnroll: (id: number) => void; onTopUp: (id: number) => void; onUnstake: (id: number) => void; onWithdraw: (id: number) => void;
};

export function Dashboard(p: DashboardProps) {
  const { me } = p;
  const balance = me ? BigInt(me.balanceWei) : 0n;
  const unit = me ? BigInt(me.unitWei) : 0n;
  const stake = BigInt(p.limit) * unit;
  const need = stake + GAS_BUDGET_WEI;
  const staked = me?.agents.filter((a) => a.state === 1 || a.state === 2).reduce((s, a) => s + BigInt(a.stakeWei), 0n) ?? 0n;
  const active = me?.agents.filter((a) => a.state === 1).length ?? 0;
  const used = me?.agents.filter((a) => a.state !== 0) ?? [];
  const firstFree = me?.agents.find((a) => a.state === 0);
  const canSign = !!me?.passkey.registered && !p.wrongSite && !p.noPasskeys && !p.busy;
  const funded = balance >= need;
  const steps = [
    { name: "Fund the wallet", done: funded || active > 0 },
    { name: "Register a passkey", done: !!me?.passkey.registered },
    { name: "Enroll an agent", done: active > 0 },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="wrap shell">
      <header className="shell-head">
        <div>
          <p className="label" style={{ marginBottom: 8 }}>Operator {me ? short(me.operator) : "…"}</p>
          <h1>Your agents</h1>
        </div>
        <div className="op-account">
          <span className="demo-note"><i style={{ background: "var(--leaf)" }} />Live · Monad testnet</span>
          {p.email && <span className="op-email">{p.email}</span>}
          <button className="btn sm" onClick={p.onLogout}>Log out</button>
        </div>
      </header>

      <div className="op-notices" aria-live="polite">
        {(p.wrongSite || p.noPasskeys) && (
          <p className="notice wait" role="alert"><i />{p.noPasskeys ? "This browser cannot create passkeys here (needs HTTPS and WebAuthn)." : <>Passkeys are tied to {p.rpId}. Open <a href={`https://${p.rpId}/operator`}>{p.rpId}/operator</a> to sign stake changes.</>}</p>
        )}
        {p.error && <p className="notice bad" role="alert"><i />{p.error}</p>}
        {p.done && <p className="notice ok" role="status"><i />{p.done.label}: confirmed. <a href={`${EXPLORER}/tx/${p.done.hash}`} target="_blank" rel="noreferrer">View transaction</a></p>}
        {p.busy && <p className="notice wait" role="status"><i className="spin" />{p.busy}… approve with your passkey if asked, then wait for the chain.</p>}
      </div>

      {me && current !== -1 && (
        <ol className="op-steps" aria-label="Setup">
          {steps.map((s, i) => (
            <li key={s.name} className={s.done ? "done" : i === current ? "now" : ""}>
              <span className="op-dot">{s.done ? <Check /> : i + 1}</span>
              <b>{s.name}</b>
              <small>{s.done ? "Done" : i === current ? "Next" : "Waiting"}</small>
            </li>
          ))}
        </ol>
      )}

      <dl className="facts">
        <div><dt>Wallet balance</dt><dd className="tnum">{me ? mon(balance, 3) : "–"}<small>MON</small></dd></div>
        <div><dt>Staked</dt><dd className="tnum">{me ? mon(staked, 2) : "–"}<small>MON</small></dd></div>
        <div><dt>Active agents</dt><dd className="tnum">{me ? active : "–"}<small>{me ? `of ${me.agents.length} slots` : ""}</small></dd></div>
        <div><dt>Passkey</dt><dd>{me ? (me.passkey.registered ? "Registered" : "Not yet") : "–"}<small>{me?.passkey.registered ? `${me.passkey.nonce} approvals` : ""}</small></dd></div>
      </dl>

      {!me ? (
        <p className="empty">Loading your operator wallet…</p>
      ) : (
        <div className="op-grid">
          <section className="panel">
            <header className="panel-head">
              <h2 className="h3">Agents</h2>
              <span className="small">Identities derive from your wallet; secrets stay on the server</span>
            </header>
            {used.length === 0 ? (
              <div className="op-empty">
                <b>No agents yet</b>
                <p className="small">Enroll your first agent from the panel on the right. It joins the public list of staked members, anonymously.</p>
              </div>
            ) : (
              <div className="scroll-x">
                <table className="tbl">
                  <thead><tr><th>Agent</th><th>State</th><th className="num">Limit</th><th className="num">Stake</th><th><span className="sr">Actions</span></th></tr></thead>
                  <tbody>
                    {used.map((a) => (
                      <tr key={a.identity}>
                        <td><div className="name">Agent {a.identity}</div><div className="small mono nowrap">{short(`0x${BigInt(a.idCommitment).toString(16)}`)}</div></td>
                        <td>
                          <span className={"pill " + tone(a.state)}><i />{STATE[a.state]}</span>
                          {a.state === 2 && <div className="small" style={{ marginTop: 6 }} suppressHydrationWarning>{me.now >= a.unlockAt ? "Ready to withdraw" : `Unlocks ${new Date(a.unlockAt * 1000).toLocaleString()}`}</div>}
                        </td>
                        <td className="num">{a.limit}<span className="small"> /epoch</span></td>
                        <td className="num">{mon(BigInt(a.stakeWei), 2)} MON</td>
                        <td className="op-actions">
                          {a.state === 1 && <button className="btn sm" disabled={!!p.busy} onClick={() => p.onTopUp(a.identity)}>Add {mon(unit, 1)} MON</button>}
                          {a.state === 1 && <button className="btn sm" disabled={!canSign} onClick={() => p.onUnstake(a.identity)}>Unstake</button>}
                          {a.state === 2 && <button className="btn sm primary" disabled={!!p.busy || me.now < a.unlockAt} onClick={() => p.onWithdraw(a.identity)}>Withdraw</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="small op-foot">Adding stake raises what a slash is worth; the per-epoch limit is set at enrollment. Unstaking removes the agent at once, then holds the deposit for {Math.round(me.unstakeDelay / 60)} minutes so a cheater cannot dodge a slash.</p>
          </section>

          <div className="op-side">
            <section className="panel">
              <header className="panel-head"><h2 className="h3">New agent</h2>{firstFree && <span className="pill"><i />slot {firstFree.identity}</span>}</header>
              <div className="field">
                <label htmlFor="l">Requests per epoch</label>
                <div className="stepper">
                  <button type="button" aria-label="Fewer requests" onClick={() => p.setLimit(Math.max(1, p.limit - 1))} disabled={p.limit <= 1}>−</button>
                  <input id="l" type="number" inputMode="numeric" min={1} max={me.maxLimit} step={1} value={p.limit} onChange={(e) => p.setLimit(Math.min(me.maxLimit, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
                  <button type="button" aria-label="More requests" onClick={() => p.setLimit(Math.min(me.maxLimit, p.limit + 1))} disabled={p.limit >= me.maxLimit}>+</button>
                </div>
                <span className="help">Up to {me.maxLimit} here. {mon(unit, 2)} MON per request.</span>
              </div>
              <dl className="kv op-sum">
                <div><dt>Stake</dt><dd className="tnum">{mon(stake, 2)} MON</dd></div>
                <div><dt>Gas reserve</dt><dd className="tnum">~{mon(GAS_BUDGET_WEI, 2)} MON</dd></div>
                <div className="total"><dt>Needed in wallet</dt><dd className="tnum">{mon(need, 2)} MON</dd></div>
              </dl>
              {!funded && (
                <div className="op-fund">
                  <p className="small">Your wallet has {mon(balance, 3)} MON. Send test MON from the <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Monad faucet</a> to:</p>
                  <div className="op-addr"><code>{me.operator}</code><button className="btn sm" onClick={p.onCopy}>{p.copied ? "Copied" : "Copy"}</button></div>
                </div>
              )}
              <button className="btn primary op-cta" disabled={!canSign || !firstFree || !funded} onClick={() => firstFree && p.onEnroll(firstFree.identity)}>
                {firstFree ? `Enroll agent ${firstFree.identity} with passkey` : "No free identity slots"}
              </button>
              {!me.passkey.registered && <p className="small" style={{ marginTop: 10 }}>Register your passkey first.</p>}
            </section>

            <section className="panel">
              <header className="panel-head"><h2 className="h3">Custody</h2><span className={"pill " + (me.passkey.registered ? "ok" : "wait")}><i />{me.passkey.registered ? "passkey on" : "no passkey"}</span></header>
              {!me.passkey.registered ? (
                <>
                  <p className="small" style={{ marginBottom: 16 }}>Create a passkey on this device and register it with the contract. It approves every enroll and unstake. You will be asked twice: create, then sign.</p>
                  <button className="btn primary op-cta" disabled={!!p.busy || p.wrongSite || p.noPasskeys} onClick={p.onRegister}>Create passkey and register</button>
                </>
              ) : (
                <>
                  <p className="small" style={{ marginBottom: 16 }}>{me.passkey.nonce} approvals so far{p.localPasskey ? " · this device" : " · created on another device or browser"}.</p>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="dest">Withdrawal address</label>
                    <input id="dest" type="text" value={p.dest} onChange={(e) => p.setDest(e.target.value.trim())} spellCheck={false} autoComplete="off" className="mono" />
                    <span className="help">Where an unstake pays out. Your passkey signs it, so nobody can redirect it.</span>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
