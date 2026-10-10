# QUOTA — Handoff for the next engineer / agent

You are continuing a hackathon build (Monad Metropolis, Track 4). Deadline **14 Oct 2026, 09:29 IST**; submit by the evening of **13 Oct**. Repo: `github.com/shane2512/QUOTA`. Phases 0–5 are done, Phase 6 (Nansen) was **cut**, Phase 7 is **built but not yet verified in a real browser** (operator console, live service console, Scout, registry v3), and Phase 8 (hardening and submission) has started (docs written, secrets scan added). **Start with §0.**

## 0. START HERE (collaborator)

**Your first job, set by the owner: test every function in Chrome, then record it.** Nothing in the web app has been run with a real Privy login and a real hardware passkey yet. Start with the live user flows in **§0b**, then follow [`chrome-test-plan.md`](chrome-test-plan.md) (73 numbered checks: public pages P, service console S, operator console O, security X, CLI C) and fill in [`chrome-test-report.md`](chrome-test-report.md). Mark PASS only for what you saw work; use BLOCKED with a reason otherwise. Passkeys work **only** on `https://quota-metro.vercel.app` (the registry's domain is permanent).

Order of work:
1. **Set up** (§7), then run the whole Chrome test plan. Fix or report every FAIL (bugs go in the report; do not change contracts or the registry address).
2. Re-run `pnpm scan:secrets`, `pnpm test`, `cd contracts && forge test` after any change.
3. **Record the demo video** with [`demo-video-script.md`](demo-video-script.md) once the test plan has no FAIL on P, S, O.
4. Finish the submission with [`submission-checklist.md`](submission-checklist.md) and [`bounties.md`](bounties.md) (what we claim, and what we do not).
5. Open owner items are in §10.

**Do not use the three wallets created on 5 Oct** (`0x0cc2…4920`, `0x8F87…2576`, `0x1Ec0…1aA6`) or any identity belonging to them. They trust the old authorization key, which leaked in chat and **cannot be deleted from the Privy dashboard** (owner confirmed 2026-10-07: ignore it). Treat that key as compromised: it can still sign registry-only transactions (value ≤ its cap) for those wallets, so nothing of value may live there. The current key, quorum and policy are in `.env` and Vercel. If a script or old doc calls `0x1Ec0…` "the agent wallet", it is stale; the demo agent wallet is `0x5b76B256d34Ff567cA3Cf2514e0B618429427dA5` (`PRIVY_AGENT_WALLET_ID` in `.env`).

Useful commands (repo root):

| Command | What it does |
|---|---|
| `pnpm test` / `pnpm typecheck` | all package and web tests (real proofs); types |
| `pnpm scan:secrets` | secrets scan of the tree and every commit (prints names only) |
| `pnpm fund <address> [amountMon]` | send test MON from the deployer (cap 1.5 MON per call) |
| `pnpm wallet-id <email>` | the console wallet id for a login; paste as `PRIVY_AGENT_WALLET_ID` to run the CLI agent as that operator |
| `pnpm --filter @quota/web dev` | local web on port 3000 (reads the root `.env` through `next.config.mjs`; Privy allows only port 3000 and the production domain) |
| `pnpm --filter @quota/web exec tsx scripts/operator-e2e.mts` | live server-side check on Monad (software passkey, ~0.9 MON) |

## 0b. How to test the live site (user flows)

Live link: **https://quota-metro.vercel.app**. Test there, in Chrome, not on a preview URL: Privy login and the passkey only work on this exact hostname. Every step below maps to an ID in [`chrome-test-plan.md`](chrome-test-plan.md); record each one in [`chrome-test-report.md`](chrome-test-report.md) (PASS only if you saw it, otherwise FAIL or BLOCKED with the reason).

**Before you start:** Chrome with DevTools open (Console and Network), a device with a passkey (Windows Hello, Touch ID, or an Android phone with a screen lock), two email inboxes you can read (A and B), about **1.5 MON of test MON** per email from `https://faucet.monad.xyz` (or ask the owner to run `pnpm fund <address>`), and the explorer `https://testnet.monadvision.com` in another tab.

### Flow 1: a first-time visitor (no login, ~5 min) · P1–P4, P7–P9
1. Open the live link. Within a second or two: the headline over a dim starfield, the night-side earth rising with three status pills. No red errors in the Console.
2. Scroll slowly with a mouse wheel, then with a trackpad. Expect one smooth, continuous scene (no stepping or stalls): the headline lifts away, the earth sinks, a line of light opens into the stake coin (back: the secret line; front: the QUOTA mark), a curved wall of request tickets wraps around it, then "One deposit. No record of who called."
3. Keep scrolling through the light sections: four stops with drawings, the comparison board, the secret-line instrument (click "Reuses request #7": the red line and the recovered key appear), the four roles, the limits list, the code block, the footer.
4. Click every header link (Demo, Docs, Operator, Service), "Stake an agent", both hero buttons and every footer link: none 404.
5. Phone width (DevTools device toolbar, 375 px): no sideways scrolling, buttons reachable. Open `/does-not-exist`: a 404 page, not a crash.

### Flow 2: watch a cheater get slashed (simulation, ~2 min) · P6
1. Open `/demo`. It must say **Simulation**.
2. Click "Send request" three times: the meter fills (3/8) and the service log shows "verified · who: unknown" rows.
3. Click "Reuse request": the stops Violation → Secret recovered → Commit → Reveal → Paid light up in order, the meter turns red, the log shows each step. Click Reset: everything clears.

### Flow 3: read the docs (~2 min) · P5
1. Open `/docs`. Scroll: the sidebar highlights the section you are reading. Click each sidebar link.
2. Click "Copy" on a code block and paste it somewhere: identical text, the button says "Copied".
3. The integration table says BTX is unavailable and claims use commit then reveal.

### Flow 4: check the live chain data (~3 min) · S1–S4, S7
1. Open `/service`. Grey loading bars first, then four live numbers and the pill "Live · Monad testnet · block N" (N grows every few seconds).
2. Compare "Agents in the tree", "Staked" and "Slashed, paid out" with the registry `0xCBdfda8ebF4302793C06a402E9753C4F43799990` on the explorer.
3. "Live requests" shows the dashed "The request feed is offline" box (expected on the live site: no demo server is hosted). `/api/service` returns JSON with no secrets.

### Flow 5: an operator stakes for an agent (the main user flow, ~15 min plus a 2-hour wait) · O1–O28, X1–X9
1. **Sign in.** Open `/operator` logged out: "Stake for your agents" with three steps. Click "Log in with email", use email A, enter the code. Expect loading panels, then "Your agents", your email, a short wallet address, the setup tracker and "No agents yet". Log out and back in: the **same** wallet address. In an Incognito window with email B: a **different** address.
2. **Fund.** The New agent panel shows Stake, Gas reserve and Needed in wallet, plus a box with your full address and "Copy". Send test MON to it. After about 30 s and a reload the balance updates and the tracker marks "Fund the wallet" done. Each agent needs 0.1 MON per request of its limit plus about 0.45 MON of gas headroom.
3. **Register the passkey.** Custody → "Create passkey and register". Approve both prompts (create, then sign). Expect "Register passkey: confirmed" with a transaction link, the pill "passkey on" and "1 approval so far". Open the transaction on the explorer: "success", it called `registerPasskey`. Also try cancelling a prompt first: a clear error, nothing on-chain.
4. **Enroll an agent.** Set "Requests per epoch" with − / + (try typing 0, 999, abc: it clamps to 1–20). Click "Enroll agent N with passkey", approve once. Within about 5 s: Agent N `active` with its limit and stake; Staked and Active agents update.
5. **Add stake.** "Add 0.1 MON" on the active agent: no passkey prompt, stake rises by 0.1.
6. **Unstake.** Check the withdrawal address (default: your wallet; garbage must be refused), click "Unstake", approve. The agent becomes `unstaking` with an unlock time **2 hours** ahead; Withdraw is disabled until then.
7. **Withdraw (after 2 hours).** Reload, click "Withdraw": the agent is `withdrawn` and the stake arrives at the withdrawal address (check on the explorer). That slot is never offered again.
8. **Security checks while logged in:** DevTools Network → `/api/operator/me` holds no keys or secrets; local storage holds only Privy items and a public passkey record; logged out, `/api/operator/me` returns 401 "log in first".

### Flow 6: a real agent calls a protected service (optional, needs the repo) · C6–C10
Run on your own machine with your own `.env`: `pnpm wallet-id <email A>`, put the id in `.env` as `PRIVY_AGENT_WALLET_ID`, enroll an agent with limit 3 on the live console, start the demo server and run the agent (exact commands in C7–C9). Expect three `OK` results, then a local refusal on the fourth. The cheat run (C10) slashes a **spare** identity; confirm the commit, reveal and `Slashed` event on the explorer.

### Flow 7: the live demo server on Render, with a real slash · C7–C10
The reference server is live at `https://quota-demo-mcp.onrender.com` (details in §0c). Everything below runs from the repo root with your own `.env`.
1. **Probe it.** `/health` returns `{"ok":true,…,"slashing":true}`; `/feed` is public JSON; `GET /api/search?q=monad` with no proof returns `401 {"reason":"missing"}`.
2. **Run an agent that passes.** Use an enrolled identity (the demo wallet has 0 and 1; yours comes from step 4). The first call after idle can take about a minute while Render wakes:
   ```bash
   cd apps/demo-mcp
   QUOTA_SERVER_URL=https://quota-demo-mcp.onrender.com/mcp pnpm exec tsx src/agent.ts --identity 0 "Monad blockchain" "zero-knowledge proof"
   ```
   Expect `OK` per call, then `/service` shows the "streaming" pill and a green "verified" row each (short nullifier, never a caller).
3. **See the limit.** One more call past the limit stops locally: `STOP … quota exhausted for this epoch`. Nothing reaches the server.
4. **Run the agent you staked on the website.** `pnpm wallet-id <your email>` prints a wallet id; pass it for one command only (do not edit `.env`):
   ```bash
   PRIVY_AGENT_WALLET_ID=<id> QUOTA_SERVER_URL=https://quota-demo-mcp.onrender.com/mcp pnpm exec tsx src/agent.ts --identity 0 "Monad blockchain"
   ```
   `--identity` is the slot number shown in `/operator`.
5. **Show a violation and a real slash.** Add `--cheat` to the same command with 3 queries. The first call passes, the next two come back `REJECTED (violation, 429)`, and within about 20 seconds `/service` shows a "slashed" row with commit and reveal links (open both on the explorer: `success`). **This permanently burns that identity and its stake**, so use a spare one: enroll it with `pnpm --filter @quota/wallets exec tsx scripts/enroll-privy-agent.ts --identity <n> --limit 1` (spends about 0.55 MON from the deployer).

**If something fails:** note the step, the Chrome version, the Console error and any transaction hash in the report. Do not change contracts or the registry address.

## 0c. Render deployment (demo server)

| | |
|---|---|
| URL | `https://quota-demo-mcp.onrender.com` (`/health`, `/feed`, `/api/search`, `POST /mcp`) |
| Service | `quota-demo-mcp`, id `srv-db47i4u0tbcc73ddugng`, free plan, Oregon, Node 22.13.1, deploys from `main` on every push |
| Dashboard | `https://dashboard.render.com/web/srv-db47i4u0tbcc73ddugng` |
| Build | `npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile --prod=false --filter @quota/demo-mcp...` (Corepack fails signature checks on Render) |
| Start | `pnpm --filter @quota/demo-mcp start`; health check `/health` |
| Env | `MONAD_RPC_URL` (public testnet RPC), `QUOTA_REGISTRY_ADDRESS`, `QUOTA_SERVER_ID=demo-mcp.quota`, `QUOTA_SLASH=1`, `QUOTA_MAX_FEE_GWEI=120`, and the Dynamic slasher: `DYNAMIC_ENVIRONMENT_ID`, `DYNAMIC_API_TOKEN`, `DYNAMIC_SLASHER_WALLET`, `DYNAMIC_WALLET_PASSWORD` (secrets). **No raw slasher key is on Render.** The slasher is the Dynamic server wallet `0x32b55C25a84c7916152851f862b46EBbED1c4A47` (TWO_OF_TWO MPC, share backed up to Dynamic; created 2026-10-09, funded 1 MON). Keep `DYNAMIC_WALLET_PASSWORD` safe: losing it strands the wallet (it happened once). |
| Vercel | `FEED_URL=https://quota-demo-mcp.onrender.com/feed` feeds the `/service` page |

Limits you will hit: the free plan sleeps after about 15 minutes idle (the first request takes about a minute) and the nullifier database resets on every restart, so replay memory starts empty. A violation is only detected when both requests land in the same server run.

Operations: `render deploys create srv-db47i4u0tbcc73ddugng` redeploys; `render logs --resources srv-db47i4u0tbcc73ddugng` reads logs. Changing an env var does not redeploy by itself; trigger one. `render services update --health-check-path` does not persist in CLI v2.15.0 (and Git Bash rewrites a leading `/` into a Windows path): use `PATCH /v1/services/{id}` with the API key from `~/.render/cli.yaml`.

**Dynamic-signed live slash (2026-10-09, after the Dynamic wallet was restored on Render):** a deliberate `--cheat` run of demo identity 2 against the Render server gave 1 verified request and 2 violations (429), then commit `0xb572efbcd5ec35e831fb1db5a442dbbc8ac2c86a33aa18f1e825965ab99a41f6` (block 69505362) and reveal `0x988136f7a26a1f882fdd585272afcfd85bf8541ac76999bd8a2555bcf42ba01c` (block 69505393), both `success` and both sent **from the Dynamic wallet** `0x32b5…4A47`. The earlier slash below used a plain key, before Dynamic was added. Identity 2 is now slashed; use identity 3 or higher for new runs.

Verified on 2026-10-09 (Monad testnet): 5 real proofs verified through the Render server, a limit-1 website agent (wallet `0x7a99…f860`, identity 0) refused locally on its second call, then a deliberate `--cheat` run: 2 violations (429) and a slash, commit `0x70c598930fe567179f90f43f833e50b0b4d33c3d82a70ad29e935c90e9e607aa` (block 69466222) and reveal `0x00a3d86d0e3163dd3b3bbfb67abd01370c0f427dd032254526ec0367c177c3f4` (block 69466242), both `success`; that agent's stake is now 0 and it can never re-enroll. Demo wallet identities: 0 (limit 3) and 1 (limit 2) active; 2 slashed (see above). Use identity 3 or higher for new runs.

### Dynamic delegated access (operator-owned slasher)

Built and verified 2026-10-09. A service operator opens `https://quota-metro.vercel.app/slasher`, signs in with an email code (Dynamic embedded wallet) and approves delegation; slashes are then signed from that wallet and the reward lands there. Code: `packages/wallets/src/dynamic-delegated.ts`, `apps/demo-mcp/src/server.ts` (`POST /dynamic/webhook`), `apps/web/app/slasher/`. Setup and dashboard steps: [`dynamic-delegation-setup.md`](dynamic-delegation-setup.md).

- **Env:** Render holds `DYNAMIC_WEBHOOK_SECRET` and `DYNAMIC_DELEGATION_PRIVATE_KEY` (the RSA private key, base64 PEM; the public half is in `docs/dynamic-delegation-public-key.pem` and in the Dynamic dashboard). Vercel holds `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`. Webhook URL in the dashboard: `https://quota-demo-mcp.onrender.com/dynamic/webhook` (events `wallet.delegation.created` and `.revoked`).
- **Behaviour:** the latest approval wins; if the delegated wallet holds under 0.3 MON the server slasher is used instead; revoking returns to it. `/feed` and `/service` report which wallet slashes. Delegations live in memory plus an encrypted file, so after a Render deploy the operator must approve again.
- **Verified:** Evidence on Monad testnet (2026-10-09), two slashes whose commit and reveal were both sent from the operator's embedded wallet `0x48726d79b26f12178069bDf8b98579F9A26AfF8C`: (1) identity 1, commit `0x79ab567bbf082323ffcbac25158a81a09089b15ca88574fd7407ebb0f796cd3d` (block 69525686), reveal `0x9e6df76cc59287fb97ac9cd5690adbf1c0cae91b37f435968c6abf9922b695c4` (block 69525709); (2) identity 2, commit `0x1b8bfb3ffcb30ea57b3b9137cc0e5dfb1dfe3f35dfa06b036c7f25d773334489` (block 69526418), reveal `0xeff5b83f68c86678096fbbd753348b81881e0bc1b26d35b87d5c9c75f0a3c268` (block 69526439). All four `success`. The operator's wallet paid about 0.2 MON of gas and received half of the forfeited stake, so with stakes of 0.1 to 0.2 MON a delegated slasher runs at a small loss; it breaks even from a limit of about 5 (0.5 MON staked).
- **To demo it:** approve on `/slasher`, enroll a spare agent (limit 1) in `/operator`, then run flow 7 step 5 with `--identity <n>` for that wallet. Use identity 3 or higher on the console wallet `0x7a99…f860` (0 to 2 are slashed).

## 1. What QUOTA is (one paragraph)
Anonymous, staked, slashable rate limits for AI-agent traffic on Monad. An operator locks a stake (approved by a human passkey, verified on-chain via the P256 precompile at `0x100`); the agent joins a Merkle tree. Each request carries an RLN-v2 zero-knowledge proof of "I am a member and this is request k of my N this epoch". Reusing a request number leaks the agent's secret `a0` (Shamir two-point recovery); anyone with `a0` can slash the stake. No issuer. The primary output is a primitive (contracts, SDKs, middleware), not a consumer app.

## 2. Read first, in this order
1. `docs/concept.md` — idea in plain words
2. `docs/01-PRD.md` — requirement IDs (C1–C8, Z1–Z4, S1–S5, B1–B3, W1–W4, T1–T3, D1–D5). Cite IDs in commits.
3. `docs/03-phases.md` — phases with exit checks. Follow the order.
4. `docs/gates.md` — **what is actually verified vs not.** Read before trusting any sponsor claim.
5. `docs/progress.md` — chronological log, decisions, open items
6. `docs/deployments.md` — addresses and tx evidence
7. `docs/quickstart-service.md`, `docs/quickstart-agent.md` — how the SDK is used
8. `docs/chrome-test-plan.md` + `chrome-test-report.md` — **your test assignment** (§0)
9. `docs/threat-model.md`, `docs/bounties.md`, `docs/demo-video-script.md`, `docs/submission-checklist.md` — what we claim, how we record it, how we submit
10. `docs/MASTER_PROMPT.md` — the working rules (summarised below). If a doc and the prompt disagree, stop and ask the owner.

## 3. Rules you must keep (from the master prompt)
- **Honesty:** never present something as working that you did not run; paste real output. Never fake a sponsor integration. State measured numbers as measured.
- **Secrets:** never commit them, never print or log them. Real values live only in the gitignored `.env`; only `.env.example` (empty placeholders) is committed. Scan the staged diff before every commit. `a0` is never logged or stored in plaintext.
- **Passkey checks** must stay: type `webauthn.get`, challenge, origin allowlist, rpIdHash, UP, UV, low-s, per-operator nonce, payload binding `(chainId, registry, operator, action, params, nonce)`. Do not use the WebAuthn PRF extension. Do not claim a passkey proves a unique human; the stake provides sybil cost.
- **No** custom circuits, no own trusted setup, no new features outside the PRD, no new dependency without a one-line justification, no `--no-verify`, no force-push, no history rewrite on `main`.
- Monad has no global public mempool. The realistic front-runner is a leader or RPC operator; say that, not "anyone in the mempool".
- Quotas are per server, not global.
- Test-first for contracts and crypto. Small commits: `<area>: <what> (PRD <ID>)`.
- Work phase by phase. Before each phase, state goal, files, exit check and biggest risk in 5 lines. After each phase report: Done / Evidence / Deviations / Needs from owner / Risks.

## 4. Current state

| Phase | State |
|---|---|
| 0 Gates | Done (Qwen deferred by owner) |
| 1 Contracts | Done. Current registry (v3) verified on Sourcify (v2/v1 superseded, no match); enroll gas measured on Monad (`eth_estimateGas` 1,299,685) |
| 2 RLN proofs | Done, including a proof against an on-chain root (closed in the Phase 3 e2e) |
| 3 Slash (commit–reveal) | Done. On-chain slash with reward on Monad testnet; searcher test in forge. **Independently re-verified 2026-10-05: forge 84/84, pnpm 17/17, typecheck clean, coverage confirmed.** |
| 4 SDKs, middleware, demo MCP | Done. Express/Hono/MCP middleware, demo MCP server live against v2, quickstarts; quickstart timing verified in 2m 27s (target ≤ 10m). **Re-verified 2026-10-05: forge 84/84, pnpm 26/26, typecheck clean, phase3 e2e 14/14 PASS on testnet. MCP live demo: 5 × OK + 1 × REJECTED (violation 429) + server-initiated on-chain slash. Windows path bug (fileURLToPath) found and fixed. Active demo agent index 5.** |
| 5 Wallet integrations | Done. Privy agent wallet (owner + policy + additional signer) and Dynamic slasher, live on Monad incl. a slash through the demo MCP server |
| 6 Trust tiers (Nansen) | **Cut** 2026-10-06 (owner): free tier, mainnet-only data (gates.md G5) |
| 7 Scout, consoles, deploy | Built, **not verified in a real browser**: registry v3 (Sourcify `match`), live service console, operator console (Privy login, real passkey, relay; server side verified live with a software passkey), Scout (scripted plan only, no model), README with the judge path. Open: the Chrome test plan, Qwen (deferred), a reachable demo server for the feed |
| 8 Hardening and submission | Started: threat model, why-not-roll-your-own, bounty text, video scripts, submission checklist, `scan:secrets` (clear on 2026-10-07). Open: Chrome test, videos, logo, integrator evidence |

### Scope decisions already taken
- **BTX does not exist for us** (organizers confirmed). Slash path is **commit–reveal only**; label it as the fallback, never as BTX.
- **Cleanverse dropped** (gate failed). No Compliant tree.
- **Dynamic**: a server-wallet signing test passed in Phase 0; delegated access was untested then and is now done and verified (see §0c).
- **Nansen**: `labels` works for Monad; `related-wallets`/`counterparties` need credits the owner does not have yet. Conditional.
- **Qwen**: owner has not decided (credits / open-weight / drop). Keep the agent loop provider-agnostic.
- Cut order if time runs out: Nansen → Dynamic. Never cut: passkey custody, RLN proofs, safe slash path, Privy, the demo agent, docs, demo video.

### What exists
```
contracts/src/PasskeyAuth.sol      WebAuthn verifier (strict parser, P256VERIFY)
contracts/src/QuotaRegistry.sol    tree, passkey registry, enroll/topUp/changeLimit/requestUnstake/unstake,
                                   commitSlash/revealSlash/removeSlashedLeaf, leaves(), MAX_LIMIT
contracts/test/*.t.sol             84 tests, all green (Slash.t.sol has the searcher test)
contracts/script/Deploy.s.sol      deploy script (env-driven; SLASH_SHARE_BPS default 5000)
contracts/tools/passkey-demo/      local page + server to create a real passkey and sign assertions
packages/core/                     @quota/core: Poseidon/field helpers, SparseMerkleTree, proof wire format,
                                   pinned RLN-20 artifacts, registry ABI, fetchTree (leaves()), syncTree (v1 events)
packages/client/                   @quota/client: QuotaClient (prove/signRequest, allowOveruse, UsageStore/FileUsageStore),
                                   deriveSecret, RegistryMembership, quotaFetch, quotaToolMeta
packages/server/                   @quota/server: QuotaVerifier, MemoryNullifierStore, RegistryRootChecker, onViolation,
                                   quotaExpress, quotaHono, quotaTool (MCP); @quota/server/sqlite: SqliteNullifierStore
packages/slasher/                  @quota/slasher: WalletAdapter, LocalKeyWallet, Broadcaster, CommitRevealPath, Slasher
packages/server/scripts/phase2-exit.ts   Phase 2 exit check (`pnpm phase2`, runs against v1)
packages/wallets/                  @quota/wallets: PrivyAgentWallet, agentPolicyRules/createAgentWallet/updateAgentPolicy,
                                   DynamicServiceWallet (+ dynamic-sdk.ts type shim). scripts/: privy-setup, privy-policy-check,
                                   privy-update-policy, enroll-privy-agent, dynamic-create-wallet, probe*, phase5-e2e
packages/devtools/                 @quota/devtools, TEST TOOLING ONLY: SoftPasskey (persistable), enrollWithSoftPasskey,
                                   scripts/enroll-agent.ts (`pnpm --filter @quota/devtools enroll-agent`),
                                   scripts/phase3-e2e.ts (`pnpm phase3`, uses .env)
apps/demo-mcp/                     reference MCP server (web_search over live Wikipedia) + REST twin + demo agent
                                   (`pnpm --filter @quota/demo-mcp start` / `agent "query" ... [--cheat]`)
docs/quickstart-service.md         protect an API in < 10 min (tested on a clean checkout)
docs/quickstart-agent.md           agent side: 5 lines + demo walkthrough
apps/scout/                        Scout (PRD D1): planner (OpenAI-compatible; Qwen via QWEN_*), tools quota_status / call_tool /
                                   switch_server / topup_stake, LiveQuotaAccount (Privy wallet + operator passkey); --scripted = test tooling
README.md                          overview, live addresses, how to run, honest limits
docs/qwen-article-draft.md         article draft; sections needing a real Qwen run are marked PENDING
apps/web/                          Next.js site: landing (components/Story.tsx + globe.ts + Galaxy.tsx), docs, /demo (labelled simulation), /service (live),
                                   /operator (Privy login + real passkey; logic in Operator.tsx, markup in View.tsx),
                                   lib/operator-server.ts + /api/operator/{me,relay}, lib/passkey-{core,browser}.ts, scripts/ (operator-e2e, fund-wallet, wallet-id)
scripts/secrets-scan.mjs           pnpm scan:secrets
docs/chrome-test-plan.md, chrome-test-report.md, bounties.md, demo-video-script.md, submission-checklist.md, threat-model.md, why-not-roll-your-own.md
docs/                              PRD, phases, gates, deployments, progress
```
Deployed on Monad testnet (chain 10143):
- **Registry v3 (current):** `0xCBdfda8ebF4302793C06a402E9753C4F43799990`, rpId `quota-metro.vercel.app`, origin `https://quota-metro.vercel.app`, unit 0.1 MON, verified on Sourcify. Leaf 0 = Privy identity 0 (slashed by the v3 e2e); leaf 1 = Privy identity 1 (Active, limit 4).
- **Wallets:** demo Privy agent wallet `0x5b76…7dA5` (current key); every console user gets their own Privy server wallet; Dynamic slasher `0xe550…2b15` (the previous Dynamic wallet `0x7d15…Aee1` is stranded, its password lost). **Ignore the three 5 Oct wallets (see §0).**
- Registry v2 (superseded): `0xd89BFd2f093015193d42EA51170D64d9242a40C6` (rpId `localhost`), holds the Phase 3–5 evidence.
- Registry v1 (superseded): `0x05a5…0ac`, holds the Phase 1 hardware-passkey evidence.
- Details and tx hashes: `docs/deployments.md`.

## 5. Contract facts you need
- **Leaf** = `Poseidon([idCommitment, limit])`, `idCommitment = Poseidon(a0)`. The contract computes the leaf itself (the PRD's C4 said the caller passes `rateCommitment`; we changed it so a caller cannot claim a bigger limit than the stake pays for).
- Tree: zk-kit `InternalBinaryIMT`, fixed depth (constructor arg; deploy default 20), **zero leaf = 0**, `PoseidonT3` from `poseidon-solidity`. Removal/update need Merkle siblings + path against the **current** root. `leaves(from, count)` returns current leaves (0 = removed) and `members(id).index` gives an agent's index, so `fetchTree` rebuilds the tree with a few `eth_call`s. `LeafSet(index, leaf)` events remain.
- **Passkey challenge** = `keccak256(abi.encode(chainId, registry, operator, uint8 action, keccak256(params), nonce))`. Actions: `0 RegisterPasskey, 1 Enroll, 2 RequestUnstake, 3 ChangeLimit`. Params are `abi.encode` of: register `(x,y)`; enroll `(id, limit, treeId, msg.value)`; unstake `(id, destination)`; changeLimit `(id, newLimit)`. Operator = `msg.sender`. The nonce increments on every successful action.
- **Slash (commit–reveal, not BTX):**
  - `commitSlash(keccak256(abi.encode(a0, receiver, salt)))`, then in a **later block** `revealSlash(a0, receiver, salt, siblings, path)`.
  - The reveal pays `SLASH_SHARE_BPS` (5000) of the stake to `receiver`. The rest is burned (locked; `totalBurned`). A 100% share is rejected because it would make self-slashing free.
  - Works while `Active` or `Unstaking`; the member becomes `Slashed` and can never re-enroll or unstake.
  - If the siblings are stale (the tree moved after they were built), the reveal still pays and sets `pendingRemoval[id]`. Anyone can then call `removeSlashedLeaf(id, siblings, path)`. The slasher does this automatically.
  - Searcher model: a leader/RPC operator copying the reveal gets `NoCommitment` (receiver is inside the commitment). A same-block commit+reveal gets `RevealTooEarly`. Once ours lands, anything later gets `NotSlashable`.
- Members (`members(id)`): `(operator, state, limit, unlockAt, stake, index, destination)`, state `0 None, 1 Active, 2 Unstaking, 3 Withdrawn, 4 Slashed`.
- Roots stay valid for `ROOT_TTL` after being superseded (`isKnownRoot`). Unstake delay (2 h) > epoch (1 h) + root TTL (10 min), so a cheater cannot unstake away from a slash.
- `rpId` and allowed origins are **immutable**. The registry must be redeployed when the final public domain is chosen (Phase 7). A passkey made for `localhost` does not work on another domain.
- `treeId` must be 0 (Screened/Compliant trees were cut). `limit` must be 1..65535 (`MAX_LIMIT`, circuit range).
- **v3 removal:** `revealSlash` and `removeSlashedLeaf` use `_tryRemove`, a single pass over the path that writes nothing unless the old root matches. It updates zk-kit's `lastSubtrees` exactly like `_update`, and `OnePassRemovalTest` pins this against a full recompute. Reveal gas: 1.58M in forge at depth 20, ~1.69M estimate on Monad. `requestUnstake` and `changeLimit` still use zk-kit `_remove`/`_update`.

## 5b. RLN facts (Phase 2)
- Artifacts: PSE p0tion ceremony `rln-20` (rlnjs 3.x defaults), circuit `circom-rln` `RLN(20, 16)`. Public signals in order: `[y, root, nullifier, x, externalNullifier]`. `y = a0 + a1·x`, `a1 = Poseidon(a0, externalNullifier, messageId)`, `nullifier = Poseidon(a1)`.
- `x = hashToField(payloadHash)`; `hashToField` = keccak256 >> 8. External nullifier = `Poseidon(hashToField(serverId), epoch)`, epoch = `floor(unix / epochLength)` (default 3600 s). The verifier accepts the current epoch and one previous one (`epochGrace`).
- Wire format: header `x-quota-proof` = base64url JSON `{proof, signals, epoch}` (`encodeProof`/`decodeProof` in core).
- Verifier order: epoch → external nullifier → payload binding → `isKnownRoot` (RPC, 5 s cache) → Groth16 → nullifier store. Same nullifier + same x = `replay`; same nullifier + different x = `violation` → `onViolation({secret, idCommitment, …})`. Never log `secret`.
- Measured on an Apple M2 (node 26): proving median 1170 ms in one run and 705 ms in another (n=10 each); verify median 16–32 ms. Windows and browser not measured.

## 6. Gotchas that already cost time
- **Privy allowed origins:** the dashboard allows only `https://quota-metro.vercel.app` and `http://localhost:3000`. On any other port or alias, Privy blocks its login iframe (`frame-ancestors` console error). Always run local web on port 3000.
- **Vercel alias:** `quota-metro.vercel.app` is attached to the project as a domain, so it follows each production deploy. (An alias set by hand pins to one deployment and goes stale.) Git pushes to `main` deploy automatically; Root Directory is `apps/web`.
- **Git Bash on Windows rewrites paths that start with `/`** (for example `vercel api /v9/...`): prefix `MSYS_NO_PATHCONV=1`.
- **Web scripts that use top-level `await` must be `.mts`** (the web package is not `"type": "module"`).
- **Turbopack and `@quota/core`:** `new URL("../artifacts/…", import.meta.url)` is treated as an asset import and breaks the web build; the artifact directory is built with path functions instead. The web server imports `@quota/client/helpers` (not the index) to avoid bundling snarkjs.
- **pnpm install scripts:** `pnpm-workspace.yaml` lists `@reown/appkit`, `bufferutil`, `keccak`, `utf-8-validate` as `false` (optional native speed-ups pulled in by the Privy browser SDK). Do not set them to true without a reason.
- **Privy and Monad are occasionally flaky:** a Privy call may fail once with an empty error; a read right after a transaction may show the old state for a few seconds. Retry once before calling it a bug. The console reads twice after each action for this reason.
- **A registered passkey cannot be replaced** and a slashed or withdrawn identity can never re-enroll. For tests always use a fresh email/user (the e2e script does) and a fresh identity slot.
- **Wallet policy blocks sweeps:** test MON sent to a console wallet cannot be taken back by us (the policy allows registry calls only), except stake returned by `unstake`.
- **Back up `.env`.** It was replaced with the teammate's file, which lost the Dynamic wallet password, so a wallet with 0.129 MON is now unrecoverable. Ids are mirrored in `deployments.md`; secrets aren't anywhere else.
- **Monad value transfers:**
  - The sender needs value + gas limit × max fee up front. Monad still *includes* an underfunded transaction, which then reverts and is charged the full gas limit. This cost two v3 enrolls; budget stake + 0.45 MON.
  - Monad also has a 10 MON reserve balance: below it, only a sender's first transaction in the k = 3 block window may spend value. `Broadcaster` waits 4 blocks after its own previous transaction before such a transfer.
  - `cast run` replays don't model either rule.
- **Monad `eth_call` applies the base fee even with `gasPrice: 0`**, so a simulation of a value call fails with "insufficient funds" unless the account holds value + gas.
- **Stopping the demo server:** use `pkill -f "src/server.ts"` and then check `ps`/`lsof -iTCP:8787`. The real command line is `…/tsx/dist/cli.mjs src/server.ts`, so `pkill -f "tsx src/server.ts"` matches nothing. A stray server from Phase 4 answered requests in Phase 5, and a cheat went undetected.
- **Dynamic:**
  - Save the full `walletMetadata` at creation (`DYNAMIC_SLASHER_WALLET`). Without `externalServerKeySharesBackupInfo` a wallet cannot sign, which is why the Phase 0 wallet is unusable.
  - Backing up to Dynamic requires a password (`DYNAMIC_WALLET_PASSWORD`).
  - `getWallets()` returns 404 with API-token auth; use `getWalletByAddress`.
  - Signing is intermittently slow (timeouts after 300 s / ~99 s); the adapter retries 3×.
  - Its `.d.ts` cannot be resolved under NodeNext, hence `packages/wallets/src/dynamic-sdk.ts`.
- **Privy:**
  - Policy rule names must be < 50 characters.
  - Creating a user by an email that already exists fails; `createAgentWallet` reuses the user by email.
  - Policies are default-deny.
  - Our key is an additional signer under an *override* policy; the operator user (owner) is not restricted.
- **A registered passkey can't be replaced.** Persist the software operator passkey (`DEMO_OPERATOR_PASSKEY`) or the operator is locked out; the first Privy wallet was lost this way.
- **A slashed identity can never re-enroll:** use the next `--identity n` (`deriveSecret(sign, n)`).
- **Foundry only exposes the P256 precompile under `evm_version = "osaka"`** (set in `contracts/foundry.toml`). Under `prague` the call returns empty and valid signatures fail. `PasskeyAuth` fails closed when the precompile is missing.
- **Monad bills the gas limit**, not gas used. Receipts show your limit as `gasUsed`. Use `eth_estimateGas` (the `Broadcaster` sends estimate × 1.15). Monad rejected a 10 gwei max fee; gas price is ~102 gwei, so scripts use a max-fee floor of 200 gwei. The sender's balance must cover limit × max fee + value, even though only limit × effective price is charged.
- **Monad executes asynchronously; this cost two failed runs and ~0.43 MON:**
  - An `eth_call` pinned to the newest block number can return state from before that block's transactions. `fetchTree` reads at latest and retries until the root matches `root()`.
  - A freshly funded account's first transaction is rejected ("Signer had insufficient balance") because consensus checks lagging state. Wait ~4 blocks after funding.
- **Never keep a funded throwaway key only in memory.** The e2e sweeps the operator's balance back in a `finally`.
- **anvil:** run with `--hardfork osaka --block-time 1`. Osaka is needed for P256. Without block time, anvil only mines on transactions, so the commit→reveal wait never ends.
- **Persist the agent's message-id count** (`FileUsageStore`). With the in-memory default, a restarted agent reuses id 0 within the epoch and the server treats it as a violation, i.e. the agent slashes itself. If you reset a demo, delete the agent usage file **and** the server's nullifier DB together.
- **Stop the server before deleting state files (Windows).** On Windows, `Remove-Item` on a SQLite file held open by the server process does not actually delete the file until the handle is closed. If you delete `nullifiers.db` while the server is running, the new server process opens the same file and finds the old nullifiers. An agent re-sending the same message IDs with different payloads then triggers violations (same nullifier, different x). Always: `kill server → delete files → restart server`. Found during Phase 4 demo testing.
- The demo-mcp server and agent load `../../.env` but **shell env wins** (`process.loadEnvFile` does not override). That is how the anvil rehearsal used public dev keys without touching `.env`.
- pnpm 11 enforces a minimum release age. A too-new package version makes it add a `minimumReleaseAgeExclude` entry to `pnpm-workspace.yaml`. Don't keep that: pin an older version instead (hono is pinned to 4.13.12 for this reason).
- `node:sqlite` needs Node ≥ 22.13 (prints an ExperimentalWarning).
- `expectRevert` in forge is consumed by the next external call. `PoseidonT2/T3.hash` are external library calls, so build Merkle proofs **before** `vm.expectRevert`.
- **Dynamic's Node SDK does not run on Windows** (`Neon: unsupported system: win32`). Use Linux, macOS or WSL (an Ubuntu distro with Node 22 worked).
- Port 3000 may be taken by the web dev server; the passkey tool uses 3777 and the registry allows both origins.
- Shell heredocs containing Solidity quotes broke Git Bash twice, and a failed multi-command line silently skipped later commands. Write files with an editor tool, and check results.
- `cast send` cannot take a tuple containing a JSON string; submit passkey assertions with viem.
- Monad testnet `eth_getLogs` is capped at 100 blocks. Event sync of v1 took 234 s for 272,700 blocks; use v2's `leaves()` (`fetchTree`) instead.
- snarkjs keeps bn128 worker threads alive; scripts/tests call `globalThis.curve_bn128.terminate()` at the end or Node never exits.
- pnpm 11 blocks install scripts; `pnpm-workspace.yaml` has `allowBuilds: esbuild: true` (needed by tsx).
- Privy test: `personal_sign` was deterministic (3/3 same wallet and message). The wallet used had no owner or policy; the owner + policy + additional-signer path is Phase 5 and untested.

## 7. Setup on a new machine
1. Node ≥ 20, pnpm ≥ 9, Foundry (`foundryup`; 1.8.4 used). Git with submodules: `git clone --recurse-submodules` (or `git submodule update --init --recursive`).
2. `cd contracts && forge test` — expect 84 passed.
3. `pnpm install && pnpm typecheck && pnpm test` — expect core 12, client 3, slasher 3, server 10, wallets 3, demo-mcp 2, scout 4, web 6 passed (~1 min, real proofs). `forge test`: 89. `pnpm scan:secrets`: ALL CLEAR. `pnpm phase2` re-runs the Phase 2 check against v1 (~4 min, event scan).
4. Copy `.env.example` to `.env` (gitignored). **Do not ask for or reuse the previous owner's keys.** Generate your own throwaway deployer and slasher keys, fund them at `https://faucet.monad.xyz`, and add sponsor keys only for accounts you own. Required env names are in `docs/02-requirements-env.md` §5 (now includes `SLASHER_PRIVATE_KEY`).
5. Public testnet RPC: `https://testnet-rpc.monad.xyz`, chain id 10143.
6. `pnpm phase3` (= `pnpm --filter @quota/devtools phase3`) re-runs the slash e2e. It spends about 0.15 MON operator gas (mostly swept back), 0.03 stake, and ~0.28 MON slasher gas. The slasher needs ≥ 0.3 MON.

## 8. Phase 3 — done (slash, commit–reveal)
Exit checks, all PASS (full output in `docs/progress.md`; txs in `docs/deployments.md`):
- **On-chain slash on Monad testnet (registry v2):** enroll → 3 RLN proofs verified against the **on-chain** root → 4th reuses a message id → server recovers `a0` → slasher commit (block 68177684) → reveal (block 68177704) → receiver +0.015 MON (50% of 0.03) → member `Slashed`, leaf removed in the reveal → a second violation is not slashed twice.
- **Searcher (copy-and-steal), forge `test/Slash.t.sol`:** the naive one-step slash is stolen by a front-runner. On commit–reveal, the copied reveal, a same-block commit+reveal, and a later reveal all fail, and an exact copy still pays our receiver.
- `forge test` 84 passed; coverage `QuotaRegistry` 98.83% lines / 80.56% branches, `PasskeyAuth` 100% lines. `pnpm test` 17 passed; typecheck clean.

## 8b. Phase 3 — independent re-verification (2026-10-05)
A separate session re-ran all locally runnable Phase 3 checks from scratch (no code changes). Full report: `docs/phase3-test-report.md`.
- `forge test`: **84 passed, 0 failed** ✅
- `forge coverage` (standard, not `--ir-minimum`): `PasskeyAuth` 100.00% lines, `QuotaRegistry` 98.83% lines / 80.56% branches ✅
- `pnpm test`: **17 passed, 0 failed** (core 9, server 5, slasher 3) ✅
- `pnpm typecheck`: **clean** across all 4 packages ✅
- Testnet e2e not re-run: slasher wallet at ~0.016 MON (needs ≥ 0.3 MON). Original PASS evidence stands.
- Testnet e2e re-run 2026-10-05: **14/14 PASS**. Agent enrolled at index 3, commit block 68347545, reveal block 68347567, receiver +0.015 MON. Txs in `deployments.md`. Slasher well-funded (9.734 MON).
- **`forge coverage --ir-minimum` artefact:** `test_commit_firstBlockKept` fails only under IR instrumentation (`assertion failed: 1 != 6`) — the Yul IR rewriter changes `block.number` tracking. Passes under `forge test` and standard coverage. Not a functional defect.

**Must fix before the demo (economics):**
- The slasher pays ~0.284 MON gas per slash (commit 59,687 + reveal 2,725,641 limit at ~102 gwei).
- At unit 0.01 MON and a 50% share, the slash only pays off when the stake is above ~0.57 MON.
- Options:
  - Raise the demo's minimum stake / `UNIT`.
  - Cut reveal gas. It hashes the Merkle path 3×: our `_verify`, then zk-kit `_update` verifies again and rewrites. Use one verify-and-rewrite pass.
- Decide at the Phase 7 redeploy (needed anyway for the public domain).

### Phase 3 session report (2026-10-04)
- **Deviations:**
  - `commitSlash` hashes `(a0, receiver, salt)`; the PRD's `limit` argument is dropped because the registry knows it.
  - `SubmitPath` exposes `slash(req)` instead of `send(tx)`.
  - Burn share added.
  - On-chain `leaves()` added.
  - The e2e uses a **software P-256 authenticator** (labelled test tooling). The hardware passkey path was proven in Phase 1 on v1 and has not been re-run on v2.
  - New env var `SLASHER_PRIVATE_KEY`.
- **Money:**
  - The v2 deploy cost ~0.84 MON.
  - A failed run stranded ~0.43 MON.
  - Balances after: deployer 0.586, slasher 0.016. Top up from the faucet before the next redeploy (~0.84) or slash (~0.28).
- **Commits:** local only, not pushed (push needs owner approval).

## 8c. Phase 4 — done (SDKs, middleware, demo MCP server, 2026-10-05)
**How requests are bound:**
- HTTP: `x = hashToField(keccak256("QUOTA/http/v1\nMETHOD\npath?query\nbody"))`; JSON bodies are canonicalised (sorted keys).
- MCP: `"QUOTA/mcp-tool/v1\ntool\ncanonical(args)"`, with the proof in `params._meta["quota/proof"]`.
- Rejections: 401 for a missing, invalid, unknown-root, wrong-payload or stale proof; 409 for a replay; 429 for a violation. MCP returns a tool error with the same reason.

**Evidence** (details in `progress.md`; agent enrollment txs in `deployments.md`):
- `pnpm test` 26 passed, using real proofs through real Express 5, Hono and MCP SDK 1.32. `forge test` 84. Typecheck clean.
- Anvil rehearsal of the whole loop, including `--cheat` → violation → on-chain commit–reveal slash from the server.
- Monad v2 with the demo agent (index 2, limit 5): 5 accepted calls with live Wikipedia results across two agent runs (the count persisted), then `STOP` at the 6th. Slashing was off because the slasher can't pay gas.
- Clean-checkout quickstart: 401 → 200 in 28 s of machine time (agent run). A human run on Windows took 2m 27s (§8d, `phase4-test-report.md`).

**Remaining for Phase 4's intent:**
- Find a named external integrator (owner).
- Packages are TS source used from the monorepo. Publishing to npm is **not done and needs owner approval** (it's outward-facing).

## 8d. Phase 4 — re-verification (2026-10-05)
**All tests pass. One Windows bug found and fixed.**

- `pnpm typecheck`: **clean** (6 packages/apps) ✅
- `forge test`: **84/84 passed** ✅
- `forge coverage`: `PasskeyAuth` 100.00% lines / 92.31% branches; `QuotaRegistry` 98.83% lines / 80.56% branches ✅
- `pnpm test`: **26/26 passed** (core 12, client 2, slasher 3, server 9) ✅
- `pnpm phase3` (Monad testnet): **14/14 PASS** ✅ — commit block 68347545, reveal block 68347567 (+22), receiver `0x05c2bF6F50D3C177C5AAB0Ade971C82F691411C8` +0.015 MON. Txs in `deployments.md`.

**Bug fixed:** `import.meta.url` `.pathname` on Windows returns `/D:/...` (leading slash), producing double-drive paths (`D:\D:\METRO\.env`) with Node's file APIs. Fixed using `fileURLToPath(new URL(..., import.meta.url))` in:
- `packages/devtools/scripts/phase3-e2e.ts`
- `packages/devtools/scripts/enroll-agent.ts`
- `apps/demo-mcp/src/server.ts` (`.env` load + SQLite DB path)
- `apps/demo-mcp/src/agent.ts` (`.env` load + usage file path)

Only triggered on Windows with tsx. Typecheck clean after fix.

**Post-test balances:** deployer 5.159 MON, slasher 9.734 MON, agent wallet 0 MON.

## 8e. Phase 4 — live MCP demo test (2026-10-05)

**Full end-to-end demo MCP server test. All Phase 4 features verified live.**

### Honest run (5 × OK)
```
agent idCommitment 7351518591..., limit 5/epoch, remaining now 5
OK  "query 1" (proof 2334 ms) -> Wikipedia results
OK  "query 2" (proof 375 ms)
OK  "query 3" (proof 361 ms)
OK  "query 4" (proof 360 ms)
OK  "query 5" (proof 367 ms)
REJECTED "cheat 6" (proof 355 ms) -> quota: request rejected (violation, HTTP-equivalent 429)
```

### Server log (QUOTA_SLASH=1)
```
[violation] message-id reuse; idCommitment 7351518591... (secret recovered, not logged)
[slash] ...: commit 0x2e1dd2bb65d6975ae... reveal 0x17c8d78c8d4b02906a...
```

### On-chain verification
- Agent (index 4, idCommitment `7351518591...`): state=4 (Slashed) ✅
- commit tx: `0x2e1dd2bb65d6975ae083b2bb9d2f59037227230cdccf1b7a6c6154304ade6cd9`
- reveal tx: `0x17c8d78c8d4b02906a6e42e18aac96904c3b5a2ef6ecf1efab6c33ee21d54ca0`

### REST twin (no proof → 401)
```
GET /api/search?q=test  ->  HTTP 401
```

### Client-side STOP (quota exhausted)
```
STOP  "overflow query": quota exhausted for this epoch (client refuses to reuse a message id)
```

### Bug found: Windows SQLite file-handle reset
`Remove-Item nullifiers.db` while server held the file open did not delete it on Windows. New server session found old nullifiers; agent re-sent same message IDs with different payloads → violation. Correct procedure: **stop server first, then delete state files**. Added to §6 gotchas.

### Fresh demo agent enrolled for Phase 5
- `AGENT_PRIVATE_KEY=0x4931...` → idCommitment `15477875465663548400315948804121926270608349604082804923542483643861837262875`
- **Index 5, limit 5, stake 0.05 MON** (Active, not slashed)
- Enroll tx: `0x74261dd7023b62501f87a3e3f241943e0aca5a11f1f310a5cf5f1e3fe1545438`

**Post-test balances:** deployer 4.933 MON, slasher 9.228 MON.

## 8f. Phase 5 — done (wallet integrations, 2026-10-05)
**Agent side (Privy):**
- Wallet `0x1Ec0d0992990008Bcf1555FFd809Ca78aE651aA6` (`PRIVY_AGENT_WALLET_ID`) is owned by the operator's Privy user.
- Our key quorum is an additional signer under an override policy. That policy allows only registry transactions on chain 10143 with value ≤ 0.1 MON, and personal_sign of `QUOTA/rln-secret/v1…`.
- The Privy wallet is the operator: it registers the (software) passkey and enrolls. The agent's secret is `deriveSecret(privy.signMessage, n)`.

**Service side (Dynamic):**
- Server wallet `0x7d150c30971cb7aE8Bf5e9Ce6deb79a12D92Aee1`. Its share is backed up to Dynamic; we keep only the metadata and the password.
- It signs commit and reveal, and receives the reward.
- Delegated access was not done in Phase 5; it was added later (2026-10-09), see §0c.

**Evidence** (txs in `deployments.md`):
- `phase5-e2e` passes on Monad: Privy enroll → proofs → cheat → Dynamic slash, with the reward received.
- The demo MCP server with `QUOTA_SLASH=1` slashed a cheating Privy agent (identity 1, index 8) on-chain via Dynamic.
- Live Privy policy check: 10/10.
- 30 package tests, forge 84.

**Exit-check caveat:**
- The demo flow uses no local agent or slasher keys.
- `.env` still holds `DEPLOYER_PRIVATE_KEY` (deploying and funding test wallets), the test-only `DEMO_OPERATOR_PASSKEY`, and the now-unused fallbacks `AGENT_PRIVATE_KEY` / `SLASHER_PRIVATE_KEY`.

**Demo usage:**
```bash
QUOTA_SLASH=1 QUOTA_MAX_FEE_GWEI=120 pnpm --filter @quota/demo-mcp start      # Dynamic slasher
pnpm --filter @quota/wallets exec tsx scripts/enroll-privy-agent.ts --identity 2 --limit 3
pnpm --filter @quota/demo-mcp agent --identity 2 "q1" "q2" "q3"          # Privy agent; then add --cheat
```
Identities already used: 0 (index 7, Active, limit 5) and 1 (index 8, Slashed). Use 2 or higher for new runs.

## 8g. Phase 7 — partial (2026-10-06)
- **Registry v3:**
  - One-pass slash removal: reveal −29% gas.
  - Unit 0.1 MON, so a limit-5 stake of 0.5 gives a 0.25 reward against ~0.2 gas. Live run: slasher net **+0.045 MON**.
  - Public rpId/origin; verified on Sourcify.
- **Privy policy** repointed to v3 with a 1 MON cap; live check 11/11.
- **Scout (`apps/scout`):**
  - `pnpm --filter @quota/scout start "goal" --identity n` (model: `QWEN_*`).
  - `--scripted [--topup]` is test tooling with no model.
  - Live on Monad with the scripted plan, all four tools worked, including an on-chain `topup_stake` (limit 3 → 4) and proofs under the new leaf.
- **Two QUOTA servers:** `QUOTA_TOOLSET=search` on :8787 (`demo-search.quota`) and `summary` on :8788 (`demo-summary.quota`).
- `README.md`, `docs/qwen-article-draft.md`.

### Session report (2026-10-06)
- **Phase 7 exit check NOT met.** It needs a judge to go from the README to login, enrol, watch Scout and see a slash. Missing: Scout has not run with a model (the Qwen key is pending), and there are no consoles (`apps/web`). The README path works from the CLI with funded keys.
- **Phase 6 cut (owner decision)** after a live re-check:
  - Nansen free tier: 10 credits/day (`related-wallets` 1 credit, `counterparties` 5).
  - Nansen's `monad` chain is mainnet, so every testnet operator returns empty data and screens "clean". The refusal case could only have been staged.
  - Evidence: `gates.md` G5. The Nansen bounty is not claimed.
- **Owner decisions:** Scout uses Qwen through sponsor credits; public passkey domain `quota-metro.vercel.app`.
- **Evidence:** 34 package tests (core 12, client 3, server 9, slasher 3, wallets 3, scout 4), `forge test` 89, typecheck clean; v3 e2e and the scripted Scout run on Monad (txs in `deployments.md`).
- **Problems hit:**
  - **Two v3 enrolls reverted on-chain**, each charged its full 2.28M gas limit (~0.2 MON each). The operator was underfunded (0.70 held vs 0.5 value + 0.27 max gas). Monad includes such a transaction and it reverts at execution. Fixed: budget stake + 0.45 MON.
  - While investigating, I added a wait in `Broadcaster` for Monad's 10 MON reserve-balance window before value transfers.
  - **`.env` was replaced** with the teammate's file and lost the Phase 5 lines. The Privy ids were restored from `deployments.md`. A new Dynamic slasher `0xe550…2b15` was created. The old Dynamic wallet `0x7d15…Aee1` (0.129 MON) is unrecoverable (password lost).
  - The owner pasted an older `.env` into chat, which **exposed live credentials**; they must be rotated (§10). It is not stored in any file.
- **Funding:** 5 MON moved from the old local-key slasher `0xb7B8…237f` (ours) to the deployer.
- **Commits:** local only. Six commits ahead of `origin/main` at the end of this session (Phase 5 + Phase 7); nothing pushed.

## 9. What to do next
See §0 for the order. In short: (1) Chrome test of every function, (2) fix what fails, (3) videos, (4) submission. Deferred by the owner: the Qwen run and article (no key). The demo server is deployed on Render (§0c), so the deployed `/service` shows a live request feed.

## 9b. Operator console (built 2026-10-07; real-browser test pending)
- `apps/web/app/operator` (+ `lib/passkey-*.ts`, `lib/operator-server.ts`, `/api/operator/{me,relay}`): Privy email login, a real WebAuthn passkey, one user-owned Privy wallet per user as the on-chain operator, relay of registerPasskey / enroll / topUp / requestUnstake / unstake. The live service console is `/service` (`/api/service`); its request feed reads `FEED_URL` (set in Vercel to `https://quota-demo-mcp.onrender.com/feed`).
- Verified on Monad v3 without a browser by `apps/web/scripts/operator-e2e.mts` (software passkey, throwaway Privy user, spends ~0.9 MON). **Not yet verified: a real Privy login and hardware passkey on `https://quota-metro.vercel.app/operator`.** The passkey only works on that hostname (the registry's rpId is immutable); Privy accepts only that origin and `http://localhost:3000`.
- Vercel production variables in use (all six are set): `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTH_PRIVATE_KEY`, `PRIVY_AUTH_KEY_QUORUM_ID`, `PRIVY_AGENT_POLICY_ID`. Optional: `OPERATOR_MAX_LIMIT` (default 20), `QUOTA_MAX_FEE_GWEI` (120), `MONAD_RPC_URL`, `FEED_URL`.
- Each user needs about 0.1 MON per message of limit plus ~0.45 MON of gas in their operator wallet (shown in the UI with the address and a faucet link). The wallet's policy lets our key sign only registry calls (value ≤ 1 MON), so test MON sent to it cannot be swept by us.
- **Old key quorum:** still alive; the dashboard cannot delete it (owner, 2026-10-07: ignore). The three 5 Oct wallets still trust it; do not use or fund them (§0).

## 9c. Web redesign (2026-10-07; replaces the transit-signage look)
The whole web app was restyled in one session; `DESIGN.md` is the source of truth for the new system. No contract, registry, API or passkey logic changed.
- **Look:** near-black ground, silver ink, pill buttons, quiet panels; light paper (`.light` scope) only for the landing sections below the story. Colour carries meaning only (green verified, red slash, amber pending). Type: Inter Tight (body, via `next/font`), Archivo expanded for the landing title and the operator sign-in title, JetBrains Mono for data.
- **Landing (`components/Story.tsx`):** one sticky, scroll-scrubbed scene (GSAP ScrollTrigger, 900vh): headline over a dim starfield (`Galaxy.tsx`, React Bits, MIT, uses the new `ogl` dependency) and a night-side earth (`globe.ts`, three.js; earth textures load at runtime from the three.js repo on jsDelivr); the earth sinks, the stake coin opens from a line of light, a curved wall of request tickets wraps around it, closing line plus CTA. Below it: four stops, comparison board, the secret-line instrument, roles, limits, code. `World.tsx` and `scene3d.ts` (the old metro flight) were deleted.
- **Performance:** measured in headless Chrome over a full story scroll: median 16.6 ms, p95 16.9 ms per frame. Rules that keep it there: transforms and opacity only, paint work runs on the timeline's own update, no backdrop blur over WebGL, the globe and starfield stop rendering once faded or off screen, starfield at 0.6 resolution.
- **Buttons:** header CTA "Stake an agent" (`/operator`); hero "Watch a cheater get slashed" (`/demo`) and "Read the quickstart"; story close "Stake an agent".
- **Operator console:** redesigned sign-in page and dashboard (setup tracker, stat panels, Agents, New agent with a stake and gas breakdown, Custody). Checked with sample data only; a real Privy login has not been run on it yet (Chrome test plan O1–O32).
- **Shared `.env`:** every app, package and script now reads the root `.env` (shell and host env still win). `apps/web/next.config.mjs` loads it and maps `QUOTA_REGISTRY_ADDRESS` and `WEBAUTHN_RP_ID` to the browser names `NEXT_PUBLIC_REGISTRY_ADDRESS` and `NEXT_PUBLIC_RP_ID` (never the RPC URL). `packages/server/scripts/phase2-exit.ts` now loads it too, so `pnpm phase2` checks the current registry from `.env` instead of its v1 fallback; set `QUOTA_REGISTRY_BLOCK` if the scan range matters. Foundry: run `forge` from the repo root with `--root contracts` to pick up the same file.
- **Chrome test plan:** P1, P2 and O1 were rewritten for the new pages; re-run P1–P9 and O1 against the new design.
- **Design audit pass (tastemaker):** route stops got drawn artifacts; one display face (Archivo expanded) for every heading, section heads capped near 60% of the hero; skeleton loading on `/service` and `/operator`; a designed "feed offline" state on `/service`; the docs sidebar marks the current section and code blocks have a copy button; the demo has a real quota meter; button hover no longer scales. The roles section keeps its original 2×2 layout (owner choice). Rules for later passes: `.tastemaker/style-lock.md`; decisions: `.tastemaker/decisions.log`.

## 10. Open items needing the owner
- **Qwen:** no key; deferred. Claim the bounty only if a real run and a published article happen (`bounties.md`).
- **Demo server host:** deployed on Render (§0c). Free plan: it sleeps after about 15 minutes idle (first call takes about a minute) and its nullifier database resets on every restart or deploy.
- **Named external integrator with evidence** (a PR, a running URL, or a written message). The biggest gap for the traction score.
- **Repo access** for `metropolis@hackathon.monad.xyz` (or confirm the repo is public); **community group** (or skip); **logo** (≤ 3 MB); team names for the pitch.
- **Judge funding:** decide between "use the faucet" and pre-funded wallets (`pnpm fund`), and say so in the submission.
- **Old credentials:** rotated; the old Privy quorum could not be deleted (ignore it, §0). Back up `.env` (it holds the Dynamic wallet password).
- Approval before publishing packages to npm (if wanted).
- Balances change; check with `pnpm fund <address> --check` (deployer about 4.2 MON on 2026-10-07).

## 11. Working-tree note
`apps/web` is the owner's. `apps/web/tsconfig.tsbuildinfo` is a generated file that shows as modified; do not commit it. `.operator-e2e-user` (git-ignored) holds the id of the throwaway Privy user used by the e2e script; its wallet `0xcc9b…dE67` has agent 0 unstaking, withdrawable to the deployer after 2026-10-07 08:52 UTC with `relay(userId, {action:"unstake", identity:0})`.
