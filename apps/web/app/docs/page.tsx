import { Code, DocsNav } from "@/components/DocsKit";

const status = [
  ["Passkey custody (P256VERIFY)", "ok", "Precompile verified on testnet; contract work in progress"],
  ["Privy agent wallets", "ok", "Deterministic secret derivation and sign-only on Monad confirmed"],
  ["Dynamic wallets", "ok", "Server wallet and embedded-wallet delegated access both live; slashes signed from an operator's wallet verified on-chain"],
  ["Nansen screening", "wait", "Wallet labels only; related-wallet checks need credits"],
  ["BTX sealed mempool", "bad", "Unavailable on testnet. Claims use commit then reveal"],
  ["Cleanverse compliant tree", "bad", "Dropped: no access to the partner network"],
  ["Qwen Scout agent", "wait", "Deferred; agent loop stays provider-agnostic"],
] as const;

const toc: [string, string][] = [
  ["judges", "Judge quickstart"],
  ["service", "Service quickstart"],
  ["agent", "Agent quickstart"],
  ["how", "How a slash works"],
  ["threats", "Threat model"],
  ["status", "Integration status"],
];

export default function Docs() {
  return (
    <div className="wrap docs">
      <DocsNav items={toc} />
      <article>
        <h1>Docs</h1>
        <p>QUOTA is a primitive: contracts, two SDKs and a middleware. The snippets below show the target interface; packages are under construction and names may change.</p>

        <section id="judges">
          <h2>Judge quickstart</h2>
          <p>No account or password is needed: any email address works for login (a one-time code is emailed). Use Chrome or Edge. Everything runs on Monad testnet and the contracts are unaudited.</p>

          <h3>Quick look (2 minutes, no funds)</h3>
          <ol>
            <li>Open <a href="/">the landing page</a> and scroll: how a deposit, a proof and a slash fit together.</li>
            <li>Open <a href="/demo">/demo</a>, a labelled simulation. Send a few requests, then reuse a request number to watch a cheater get slashed step by step.</li>
            <li>Open <a href="/service">/service</a>: live chain data and a live request feed from the demo server. Rows show only short throwaway numbers, never who sent a request.</li>
          </ol>

          <h3>Stake an agent in the browser (about 5 minutes, needs test MON)</h3>
          <ol>
            <li>Open <a href="/operator">/operator</a> and log in with any email and the code you receive. A wallet that only you own is created (Privy). Copy its address.</li>
            <li>Send about 0.6 MON from the <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Monad faucet</a> to that address: 0.1 MON of stake per request of limit, plus about 0.45 MON for gas. Wait about 30 seconds and reload.</li>
            <li>Click <b>Create passkey and register</b> and approve with Windows Hello, Touch ID or your phone (two prompts: create, then sign). Passkeys only work on quota-metro.vercel.app.</li>
            <li>Click <b>Enroll agent</b> with a limit of 1 and approve with your passkey. The agent turns <code>active</code>, and the chain has verified your passkey signature.</li>
          </ol>

          <h3>Send requests from an agent and trigger a real slash (about 10 minutes)</h3>
          <p>You need Node 22, pnpm 11 and about 1 test MON. This uses throwaway keys and a software passkey (test tooling), and runs against the live demo server.</p>
          <ol>
            <li>Clone the repo and install:</li>
          </ol>
          <Code>{`git clone --recurse-submodules https://github.com/shane2512/QUOTA
cd QUOTA
pnpm install`}</Code>
          <ol start={2}>
            <li>Make two throwaway keys by running this twice: one funder, one agent. Never reuse a real key.</li>
          </ol>
          <Code>{`pnpm --filter @quota/demo-mcp exec node --input-type=module -e "import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts'; const k=generatePrivateKey(); console.log(k, privateKeyToAccount(k).address)"`}</Code>
          <ol start={3}>
            <li>Send about 1 MON from the faucet to the <b>funder</b> address, then create a file named <code>.env</code> in the repo root:</li>
          </ol>
          <Code>{`MONAD_RPC_URL=https://testnet-rpc.monad.xyz
QUOTA_REGISTRY_ADDRESS=0xCBdfda8ebF4302793C06a402E9753C4F43799990
WEBAUTHN_RP_ID=quota-metro.vercel.app
DEPLOYER_PRIVATE_KEY=<the funder key>
AGENT_PRIVATE_KEY=<the agent key>
AGENT_LIMIT=1
QUOTA_SERVER_URL=https://quota-demo-mcp.onrender.com/mcp`}</Code>
          <ol start={4}>
            <li>Stake the agent (about 30 seconds):</li>
          </ol>
          <Code>{`pnpm --filter @quota/devtools enroll-agent`}</Code>
          <ol start={5}>
            <li>Send a request. It prints <code>OK</code> with Wikipedia results, and a verified row appears on <a href="/service">/service</a>:</li>
          </ol>
          <Code>{`pnpm --filter @quota/demo-mcp agent "monad blockchain"`}</Code>
          <ol start={6}>
            <li>Send another. The client refuses with <code>quota exhausted for this epoch</code> and sends nothing:</li>
          </ol>
          <Code>{`pnpm --filter @quota/demo-mcp agent "one more"`}</Code>
          <ol start={7}>
            <li>Cheat by reusing a request number. Both calls print <code>REJECTED (violation)</code>, and about 30 seconds later /service shows a slashed row with commit and reveal transactions. <b>This permanently burns the throwaway agent.</b></li>
          </ol>
          <Code>{`pnpm --filter @quota/demo-mcp agent --cheat "one" "two"`}</Code>
          <p>The first request after a quiet period can take about a minute: the demo server sleeps on a free plan.</p>

          <h3>Optional: delegate slashing to your own wallet (Dynamic)</h3>
          <p>Open <a href="/slasher">/slasher</a>, sign in with an email code (a Dynamic embedded wallet is created) and click <b>Approve delegation</b>. The server status then reads &ldquo;Slashing from your wallet&rdquo;, meaning later slashes on our server are signed from your own wallet. <b>Revoke delegation</b> undoes it.</p>

          <h3>Check it on-chain</h3>
          <p>Two slashes whose commit and reveal were both sent from an operator&apos;s Dynamic embedded wallet, <code>0x4872…FF8C</code>:{" "}
            <a href="https://testnet.monadvision.com/tx/0x1b8bfb3ffcb30ea57b3b9137cc0e5dfb1dfe3f35dfa06b036c7f25d773334489" target="_blank" rel="noreferrer">commit</a>,{" "}
            <a href="https://testnet.monadvision.com/tx/0xeff5b83f68c86678096fbbd753348b81881e0bc1b26d35b87d5c9c75f0a3c268" target="_blank" rel="noreferrer">reveal</a>.
            Open either and read the sender.</p>
        </section>

        <section id="service">
          <h2>Service quickstart</h2>
          <p>Protect an Express, Hono or MCP server in a few lines. You choose how many requests an hour and which trust lists you accept.</p>
          <Code>{`pnpm add @quota/server @quota/slasher

import { quota } from "@quota/server";
import { Slasher, DynamicServiceWallet } from "@quota/slasher";

const slasher = new Slasher({ wallet: new DynamicServiceWallet() });

app.use(quota({
  serverId: "lantern-search",
  perEpoch: 100,          // requests per hour per staked agent
  trees: ["open"],        // or ["open", "screened"]
  onViolation: slasher.submit,
}));`}</Code>
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
          <Code>{`import { QuotaClient, PrivyAgentWallet } from "@quota/client";

const quota = new QuotaClient({ wallet: new PrivyAgentWallet() });

const headers = await quota.signRequest("lantern-search", payloadHash);
await fetch(url, { headers });`}</Code>
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
