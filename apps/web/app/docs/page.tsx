const status = [
  ["Passkey custody (P256VERIFY)", "ok", "Precompile verified on testnet; contract work in progress"],
  ["Privy agent wallets", "ok", "Deterministic secret derivation and sign-only on Monad confirmed"],
  ["Dynamic service wallet", "wait", "Server-wallet path confirmed; delegated access not yet proven"],
  ["Nansen screening", "wait", "Wallet labels only; related-wallet checks need credits"],
  ["BTX sealed mempool", "bad", "Unavailable on testnet. Claims use commit then reveal"],
  ["Cleanverse compliant tree", "bad", "Dropped: no access to the partner network"],
  ["Qwen Scout agent", "wait", "Deferred; agent loop stays provider-agnostic"],
] as const;

export default function Docs() {
  return (
    <div className="wrap docs">
      <aside aria-label="On this page">
        <a href="#service">Service quickstart</a>
        <a href="#agent">Agent quickstart</a>
        <a href="#how">How a slash works</a>
        <a href="#threats">Threat model</a>
        <a href="#status">Integration status</a>
      </aside>
      <article>
        <h1>Docs</h1>
        <p>QUOTA is a primitive: contracts, two SDKs and a middleware. The snippets below show the target interface; packages are under construction and names may change.</p>

        <section id="service">
          <h2>Service quickstart</h2>
          <p>Protect an Express, Hono or MCP server in a few lines. You choose how many requests an hour and which trust lists you accept.</p>
          <pre className="code"><code>{`pnpm add @quota/server @quota/slasher

import { quota } from "@quota/server";
import { Slasher, DynamicServiceWallet } from "@quota/slasher";

const slasher = new Slasher({ wallet: new DynamicServiceWallet() });

app.use(quota({
  serverId: "lantern-search",
  perEpoch: 100,          // requests per hour per staked agent
  trees: ["open"],        // or ["open", "screened"]
  onViolation: slasher.submit,
}));`}</code></pre>
          <h3>What you get</h3>
          <ul>
            <li>Proof verification off-chain in milliseconds.</li>
            <li>A nullifier store holding one line per epoch and nullifier.</li>
            <li>Automatic secret recovery on a repeat, queued to the slasher.</li>
          </ul>
        </section>

        <section id="agent">
          <h2>Agent quickstart</h2>
          <p>Stake once from the operator console, then sign each request through the SDK.</p>
          <pre className="code"><code>{`import { QuotaClient, PrivyAgentWallet } from "@quota/client";

const quota = new QuotaClient({ wallet: new PrivyAgentWallet() });

const headers = await quota.signRequest("lantern-search", payloadHash);
await fetch(url, { headers });`}</code></pre>
          <p>The client tracks request numbers per epoch and refuses to exceed your limit, so an honest agent can never trigger a slash by accident.</p>
        </section>

        <section id="how">
          <h2>How a slash works</h2>
          <p>Each request carries one point on a line derived from the agent&apos;s secret. A repeated request number yields a second point, which fixes the line and reveals the secret. The slasher then claims the stake in two steps.</p>
          <ol>
            <li><code>commitSlash</code> publishes a hash of the secret, limit, receiver and a salt.</li>
            <li>After at least one block, <code>revealSlash</code> discloses them. Copying the reveal with a different receiver fails the hash check.</li>
          </ol>
        </section>

        <section id="threats">
          <h2>Threat model</h2>
          <h3>A stolen agent key</h3>
          <p>It cannot touch the deposit. Unstaking, limit changes and withdrawal address changes need the operator&apos;s passkey, verified on-chain with a nonce.</p>
          <h3>Copy and steal</h3>
          <p>A searcher watching the public mempool sees only a hash during the commit. This is a documented fallback, not a sealed mempool.</p>
          <h3>Splitting stake</h3>
          <p>Allowance is linear in stake, so many small deposits gain nothing over one large one.</p>
          <h3>What it does not cover</h3>
          <p>It is not proof of personhood, and the quota is per server. Services should size their minimum stake above the value of the abuse they expect.</p>
        </section>

        <section id="status">
          <h2>Integration status</h2>
          <p>Each integration is listed with what has actually been observed, not what is planned.</p>
          <div className="scroll-x" style={{ marginTop: 16 }}>
            <table className="tbl">
              <thead><tr><th>Piece</th><th>State</th><th>Evidence</th></tr></thead>
              <tbody>
                {status.map(([a, s, b]) => (
                  <tr key={a}><td className="name">{a}</td><td><span className={"pill " + s}><i />{s === "ok" ? "confirmed" : s === "wait" ? "partial" : "not used"}</span></td><td>{b}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </div>
  );
}
