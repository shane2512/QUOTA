import Link from "next/link";
import Story from "@/components/Story";
import Shamir from "@/components/Shamir";
import Rise from "@/components/Rise";

const stops = [
  { name: "Stake", body: "An operator locks a deposit with a passkey and the agent joins a public list of staked members.", rows: [["Custody", "Passkey, checked on-chain"], ["Allowance", "Linear in stake"]] },
  { name: "Prove", body: "Every request carries a zero-knowledge proof: a staked member, request k of N this epoch.", rows: [["Circuit", "RLN-v2, audited and reused"], ["Scope", "Quotas are per server"]] },
  { name: "Check", body: "The service checks the proof off-chain and learns nothing about who sent it.", rows: [["Check", "Off-chain, milliseconds"], ["Memory", "One line per nullifier"]] },
  { name: "Slash", body: "Reusing a request number leaks the agent's key. Anyone holding it can claim the stake.", rows: [["Claim path", "Commit, then reveal"], ["Payout", "Slasher paid, rest burned"]] },
];

const board = [
  ["API keys and accounts", "Every call ties to one identity, and a full activity log builds up. Agents cannot fill in signup forms.", "bad", "Logs everything"],
  ["IP address limits", "Honest agents share cloud IPs and get blocked. Abusers rent fresh ones for pennies.", "bad", "Punishes the honest"],
  ["CAPTCHA", "Built to stop bots. Your legitimate agent is a bot.", "bad", "Blocks the caller"],
  ["Pay per call", "Each payment is public, so an agent's whole history is visible. Many free endpoints do not want to charge.", "wait", "Public history"],
  ["Privacy Pass and ARC", "Private, but a company decides who gets in. One party holds the trust layer.", "wait", "Gatekeeper"],
] as const;

const roles = [
  ["Operator", "The person or team that owns agents. Taps a passkey to lock, change or withdraw a deposit. Public at enrollment, never again.", "Privy agent wallet, policy-limited"],
  ["Agent", "The program making requests. It holds a secret key derived from a wallet signature, so it is recoverable and never stored in plain text.", "@quota/client"],
  ["Service", "An API, MCP tool server or site. It sets requests per epoch, chooses which trust lists to accept, and keeps one line per nullifier.", "@quota/server middleware"],
  ["Slasher", "Runs beside the service. When a number repeats it recovers the secret and claims the deposit through a commit then reveal.", "@quota/slasher, Dynamic server wallet"],
];

const limits = [
  ["Not proof of being human.", "A passkey is not a person. The deposit is what makes abuse expensive."],
  ["Limits are per service.", "Each service sets its own N, so total exposure is N for every server you call."],
  ["The deposit must outweigh the abuse.", "Services choose a minimum tier. We publish guidance on sizing it."],
  ["Proofs take time.", "Built for tool servers, APIs and scraping targets, not for public RPC."],
  ["The operator is public at enrollment.", "Anonymity is among everyone staked in the accepted trees at that moment."],
  ["No sealed mempool yet.", "BTX is not live on Monad testnet, so claims use commit then reveal. We say so plainly."],
];

export default function Home() {
  return (
    <>
      <Story />
      <Rise />

      <div className="light">
        <section className="sec wrap" id="line">
          <div className="sec-head" data-rise>
            <h2 className="h2">Four stops. One deposit.</h2>
            <p>The whole journey of a request, from the stake that backs it to the slash that punishes a repeat.</p>
          </div>
          <ol className="route" data-rise>
            {stops.map((s) => (
              <li key={s.name} className={s.name === "Slash" ? "hot" : undefined}>
                <i aria-hidden="true" />
                <h3 className="h3">{s.name}</h3>
                <p>{s.body}</p>
                <dl>{s.rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
              </li>
            ))}
          </ol>
        </section>

        <section className="sec wrap" id="why">
          <div className="sec-head" data-rise>
            <h2 className="h2">Every fix so far keeps a record or picks a gatekeeper.</h2>
            <p>Anyone running a free or cheap endpoint has to stop one agent sending millions of calls. This is what is on the board today.</p>
          </div>
          <div className="board" data-rise role="table" aria-label="How existing rate-limit approaches fail agents">
            <div className="row head" role="row"><span role="columnheader">Approach</span><span role="columnheader">Where it breaks for agents</span><span role="columnheader">Status</span></div>
            {board.map(([a, b, s, t]) => (
              <div className="row" role="row" key={a}>
                <span className="what" role="cell">{a}</span>
                <span className="why" role="cell">{b}</span>
                <span className={"stat " + s} role="cell"><i />{t}</span>
              </div>
            ))}
            <div className="row quota" role="row">
              <span className="what" role="cell">QUOTA</span>
              <span className="why" role="cell">Private for the caller, enforceable for the service, run by no company.</span>
              <span className="stat ok" role="cell"><i />Bounded, not identified</span>
            </div>
          </div>
        </section>

        <section className="sec wrap" id="secret">
          <div className="sec-head" data-rise>
            <h2 className="h2">Breaking the rule exposes the cheater.</h2>
            <p>Each request carries one point on a secret line. One point is noise. Two points on the same line are the secret itself.</p>
          </div>
          <div data-rise><Shamir /></div>
        </section>

        <section className="sec wrap" id="roles">
          <div className="sec-head" data-rise><h2 className="h2">Four roles. No one in charge.</h2></div>
          <div className="cast">
            {roles.map(([h, p, t]) => (
              <div key={h} data-rise><h3 className="h3">{h}</h3><p>{p}</p><span className="label tag">{t}</span></div>
            ))}
          </div>
        </section>

        <section className="sec wrap" id="limits">
          <div className="sec-head" data-rise>
            <h2 className="h2">What QUOTA does not do.</h2>
            <p>We would rather you hear it here than find it in production.</p>
          </div>
          <ul className="limits" data-rise>
            {limits.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}
          </ul>
        </section>
      </div>

      <section className="sec wrap closer-sec" id="build">
        <div className="closer">
          <div data-rise>
            <h2 className="h2">A middleware, not an accounts system.</h2>
            <p className="lede" style={{ margin: "20px 0 32px" }}>Set how many requests per epoch and which trust lists you accept. Slash rewards go to your wallet.</p>
            <div className="actions">
              <Link href="/docs#service" className="btn primary">Read the quickstart</Link>
              <Link href="/service" className="btn">Open the service console</Link>
            </div>
          </div>
          <pre className="code" data-rise aria-label="API sketch"><code>{`import { quota } from "@quota/server";

app.use(
  quota({
    serverId: "lantern-search",
    perEpoch: 100,
    trees: ["open"],
    onViolation: slasher.submit,
  })
);`}</code></pre>
        </div>
        <p className="small" style={{ marginTop: 16 }}>API sketch of the target interface. The packages are under construction; see the integration status in the docs.</p>
      </section>
    </>
  );
}
