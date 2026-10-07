# QUOTA — Chrome test plan (every function)

**Who:** the collaborator taking over. **Rule from the owner: test everything in Chrome**, every function listed here, and record the result. Nothing in this plan has been verified with a real browser login and a real hardware passkey yet: that is exactly what you are for.

Record results in [`chrome-test-report.md`](chrome-test-report.md) (one row per ID). **PASS only if you saw it work yourself.** If you could not run a step, mark it BLOCKED with the reason. A wrong PASS is worse than a FAIL.

## 0. Setup

| Need | Detail |
|---|---|
| Browser | Chrome (stable) on a machine with a platform passkey: Windows Hello, Touch ID, or Android phone with screen lock. Note the Chrome version in the report. Use DevTools (Console + Network) for the whole run |
| Production URL | `https://quota-metro.vercel.app`. **Passkeys only work on this exact hostname** (the registry's domain is permanent). Do the operator tests here, not on `localhost` and not on a `*.vercel.app` preview URL |
| Accounts | Two email addresses you can receive mail on (call them A and B) |
| Test MON | Faucet `https://faucet.monad.xyz`, or ask the owner to run `pnpm fund <address>`. Each enrollment needs about 0.1 MON per request of limit plus about 0.45 MON of gas |
| Explorer | `https://testnet.monadvision.com` (open each transaction the console links to and confirm "success") |
| Repo | `git clone --recurse-submodules`, `pnpm install`, a `.env` with your own throwaway keys (copy `.env.example`; do not reuse anyone else's). The CLI section needs it |
| Local web (for S5, O31) | `next dev` does not read the root `.env`. Create `apps/web/.env.local` (git-ignored) with `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTH_PRIVATE_KEY`, `PRIVY_AUTH_KEY_QUORUM_ID`, `PRIVY_AGENT_POLICY_ID` (and `FEED_URL` for S5), then `pnpm --filter @quota/web dev`. It must run on **port 3000**: Privy only allows `https://quota-metro.vercel.app` and `http://localhost:3000` |

**Do not use the three wallets created on 5 Oct** (`0x0cc2…4920`, `0x8F87…2576`, `0x1Ec0…1aA6`) or any identity that belongs to them. They trust the old authorization key, which was exposed in chat and **cannot be deleted from the dashboard**. Treat that key as compromised: it can still sign registry-only transactions (value ≤ its policy cap) for those wallets, so nothing of value may live there. The current key, quorum and policy are in `.env` / Vercel. If you ever see `0x1Ec0…` in a script or doc as "the agent wallet", it is stale.

Rules that still apply (full list in `HANDOFF.md`): never paste a secret into chat, a commit or a screenshot; honest wording only (this is testnet; our contracts are unaudited; commit–reveal, not BTX).

## 1. Public pages (no login)

| ID | Do this | Expected |
|---|---|---|
| P1 | Open `/` and wait for it to load | Page loads; the headline "Rate limits that keep no record" rises in over a dim starfield, and the night-side earth (with three status pills) rises from the bottom; no red errors in the Console |
| P2 | Scroll the whole landing page | In order: the headline lifts away, the earth sinks into the dark, a line of light opens into the stake coin (back shows the secret line, front shows the QUOTA mark), a curved wall of request tickets wraps around it, then "One deposit. No record of who called." Smooth (no stutter), text readable, coin engraving sharp on both faces; then the light sections and footer with no layout jump |
| P3 | Click every item in the top navigation (Demo, Docs, Operator, Service) and the footer links | Each goes to the right page; none 404; the active nav item is highlighted |
| P4 | Landing page text: read every claim | No claim that BTX is live (it says commit–reveal), no "audited", no "mainnet". Anything illustrative is labelled |
| P5 | `/docs` | Content loads; the BTX row says unavailable; links work |
| P6 | `/demo` | The page says it **simulates** the flow with synthetic values. Click "send" a few times, then "cheat": stages Violation → Secret recovered → Commit → Reveal → Paid animate; Reset works |
| P7 | Open `/does-not-exist` | A sensible 404 page, not a crash |
| P8 | DevTools device toolbar: 375 px wide (phone) on `/`, `/service`, `/operator` | No horizontal scrolling; buttons reachable; tables scroll inside their own box |
| P9 | Reload each page with the browser's cache disabled (DevTools Network → Disable cache) | Same result; no failed requests except those you expect (none) |

## 2. Service console `/service` (live data)

| ID | Do this | Expected |
|---|---|---|
| S1 | Open `/service` | The top-right pill says "Live · Monad testnet · block N" and N grows every few seconds; no error pill |
| S2 | Compare the four numbers with the chain. On the explorer open the registry `0xCBdfda8ebF4302793C06a402E9753C4F43799990` | "Agents in the tree" = non-removed leaves; "Staked in the registry" = contract balance minus locked burn; "Slashed, paid out" = reward share of the burn; they should be consistent with `docs/deployments.md` (burn 0.25 MON from the earlier slash) |
| S3 | Watch DevTools Network for `/api/service` | One request about every 3 s, status 200, JSON with `chain` filled in |
| S4 | With **no** demo server connected (production default) | "Live requests" shows the pill "demo server offline" and a sentence explaining why; the slash history table says no slashes since the server started and links to the explorer. Chain facts are still live |
| S5 | **Local feed test** (needs the repo): run a demo server `PORT=8787 QUOTA_SERVER_ID=demo-search.quota pnpm --filter @quota/demo-mcp start`, then `FEED_URL=http://localhost:8787/feed pnpm --filter @quota/web dev` and open `http://localhost:3000/service` | The pill turns "streaming". Run the demo agent (C9): rows appear with short nullifiers and "verified". With `--cheat` a "violation" row (red) appears and, if slashing is on, a slash row with commit and reveal links |
| S6 | Stop the demo server while the page is open | Within a few seconds the feed switches back to "demo server offline"; the page does not crash; chain data stays live |
| S7 | Open `/api/service` directly in a tab | JSON, no secrets (only counts, short nullifiers, statuses, tx hashes) |

## 3. Operator console `/operator` (login, passkey, stake)

Run this section on the production URL, in a normal window first, then repeat a few items in an Incognito window.

### Login and wallet

| ID | Do this | Expected |
|---|---|---|
| O1 | Open `/operator` logged out | Heading "Stake for your agents", a three-step list (Log in, Register a passkey, Enroll an agent), a "Log in with email" button and an "Agent quickstart" link. No wallet data. After login: heading "Your agents", a setup tracker until the first agent is active, four stat panels, then the Agents, New agent and Custody panels |
| O2 | Click "Log in with email", enter email A | Privy dialog opens; it emails a code |
| O3 | Enter a **wrong** code | Privy shows an error; you stay logged out |
| O4 | Enter the right code | The page switches to the logged-in view within a few seconds; your email and a short wallet address appear in the header; a table of 6 agent slots, all "free" |
| O5 | Note the wallet address (full address is in the funding box when your balance is low). Log out (button top right), log back in with email A | **Same wallet address** as before |
| O6 | Log in with email B (separate Incognito window) | A **different** wallet address; its own empty slots |
| O7 | Refresh the page while logged in | You stay logged in and the data reloads; no flash of the logged-out view that sticks |
| O8 | Log out | You are back on the logged-out view; the console data is gone from the page |

### Funding

| ID | Do this | Expected |
|---|---|---|
| O9 | With a balance of 0, look at the "Create an agent" panel | A yellow box says the wallet needs about N MON, with the faucet link, the full address, and a "Copy address" button; the Enroll button is disabled |
| O10 | Click "Copy address", paste it somewhere | The pasted text is exactly the wallet address; the button says "Copied" briefly |
| O11 | Fund the wallet (faucet, or `pnpm fund <address> 0.8`), wait about 30 s, reload | "Wallet balance" shows the new amount; the yellow box disappears once the balance covers the stake plus gas |

### Passkey

| ID | Do this | Expected |
|---|---|---|
| O12 | Before registering: look at Custody | "Passkey: not yet" in the top numbers; a button "Create passkey and register" |
| O13 | Click it, then **cancel** the first system prompt | A red message appears (cancelled); nothing changed on the page or on-chain; you can click again |
| O14 | Click it again; approve the first prompt (create), **cancel the second** (sign) | An error; the passkey is **not** registered on-chain (check "Passkey: not yet" after refresh). You can retry from the start |
| O15 | Click it and approve both prompts | A green "Register passkey: confirmed" line with a "View transaction" link; after a few seconds "Passkey: registered" and the Custody box shows "approvals so far: 1". The explorer transaction is "success" |
| O16 | Open the transaction on the explorer; confirm it called `registerPasskey` on the registry | Yes |
| O17 | Try "Create passkey and register" again (button should be gone) | Not available once registered (a registered passkey cannot be replaced) |

### Enroll, add stake, unstake, withdraw

| ID | Do this | Expected |
|---|---|---|
| O18 | In "Requests per epoch" enter 0, -1, 1.5, 999, abc | The value is clamped to a whole number from 1 to the shown maximum (20); the "Stake required" text updates (limit × 0.1 MON) |
| O19 | With limit 1 and enough balance: click "Enroll agent 0 with passkey" | One passkey prompt. Then a green "Enroll agent 0: confirmed" with a tx link; within about 5 s the table shows Agent 0 `active`, limit 1, stake 0.10 MON; "Staked" and "Active agents" numbers update |
| O20 | Enroll again | Uses the next free slot (agent 1); the previous agent is unchanged |
| O21 | With a balance **below** the needed amount | The Enroll button is disabled and the yellow box shows the shortfall |
| O22 | Click "Add 0.1 MON" on an active agent | No passkey prompt (adding stake needs none); tx confirmed; stake rises by 0.1 |
| O23 | In "Withdrawal address" type garbage, then click Unstake | Error that the address is bad (nothing signed on-chain). Fix the address (default is your wallet) |
| O24 | Click "Unstake" on an active agent | One passkey prompt; confirmed; the agent becomes `unstaking` and shows "unlocks <date and time>" about 2 hours ahead; limit and stake still shown; the Unstake and Add buttons are gone |
| O25 | Look at the Withdraw button on that row | Disabled before the unlock time |
| O26 | **After the 2-hour delay**, reload and click "Withdraw" | Confirmed; the agent becomes `withdrawn`; the stake arrives at the withdrawal address (check its balance on the explorer) |
| O27 | Try to re-enroll the withdrawn slot | The slot is not offered again (withdrawn identities can never re-enroll); the next free slot is used |
| O28 | Click an action twice quickly (double-click Enroll) | Only one transaction is sent; if a second one is attempted the page shows "slow down; one transaction at a time" and nothing breaks |

### Passkey robustness

| ID | Do this | Expected |
|---|---|---|
| O29 | On a **second device or browser profile**, log in with email A (passkey registered elsewhere) and try Unstake/Enroll | The Custody box says the passkey was created on another device; signing uses the browser's picker (a phone or synced passkey works; a passkey that lives only on the first device cannot be used, and the page must show a clear error, not hang) |
| O30 | Same device: DevTools → Application → Local storage → delete the `quota:passkey:…` item, then Enroll or Unstake | Still works: the browser offers the stored passkey in its picker |
| O31 | Run the web app locally on port 3000 (see Setup), open `http://localhost:3000/operator` and log in (Privy allows this origin; other ports and the `*.vercel.app` aliases are blocked by Privy, so login cannot even start there) | A yellow warning says passkeys only work at `quota-metro.vercel.app`; the Create, Enroll and Unstake buttons are disabled |
| O32 | Wait for the login session to expire (or delete the Privy cookie/localStorage entries) and click an action | A clear "log in again" message, not a blank page |
| O33 | Two tabs logged in as the same user: enroll in tab 1, then refresh tab 2 | Tab 2 shows the new state after refresh |
| O34 | Android Chrome with a screen lock: repeat O4, O15, O19, O24 | Same results; the page is usable at phone width |

## 4. Cross-checks and security (Chrome DevTools)

| ID | Do this | Expected |
|---|---|---|
| X1 | In a tab (not logged in) open `/api/operator/me` | `{"error":"log in first"}` with status 401 |
| X2 | Logged in, DevTools Network → `/api/operator/me` response | Contains the wallet, balances, six `idCommitment` values and agent states. **No** secrets: no private keys, no `a0`, no tokens |
| X3 | Network → the `relay` request after an action: request and response | Request carries `Authorization: Bearer …` (your Privy token) and the passkey assertion; response is `{hash, block}` only |
| X4 | Application → Local storage, Session storage, Cookies for the site | Only: Privy session items and `quota:passkey:<address>` containing a credential id and a **public** key. No private key anywhere |
| X5 | Copy a `relay` request (an Enroll or Unstake) as `fetch` in the Console and replay it | An error and no second action: usually 409 ("already enrolled" / "not active") because the state check comes first; if you replay it against a fresh slot the registry rejects the stale passkey signature (`ChallengeMismatch`, status 422) |
| X6 | Console: `fetch('/api/operator/relay',{method:'POST'})` with no auth header | 401 |
| X7 | Console: run `fetch('/api/operator/relay',{method:'POST',headers:{authorization:'Bearer abc'},body:'{}'})` | 401 "invalid or expired session" |
| X8 | Verify each console transaction on the explorer | Status "success"; `to` is the registry; the sender is your operator wallet; value matches (stake for enroll and top-up, 0 for the rest) |
| X9 | Open the contract on the explorer and read `passkeys(<your operator address>)` and `members(<idCommitment from X2>)` | Passkey x/y non-zero after O15; the member state/limit/stake match the console |

## 5. CLI functions (terminal; view results in Chrome where noted)

All need a clean checkout and your own `.env` (see `HANDOFF.md` §7). Commands are from the repo root.

| ID | Do this | Expected |
|---|---|---|
| C1 | `pnpm install && pnpm typecheck` | No errors |
| C2 | `pnpm test` | All packages pass (core 12, client 3, slasher 3, server 10, wallets 3, demo-mcp 2, scout 4, web 6) |
| C3 | `cd contracts && forge test` | 89 passed |
| C4 | `pnpm scan:secrets` | `ALL CLEAR` |
| C5 | `pnpm fund <your operator address> --check`, then `pnpm fund <address> 0.01` | Balances print; the send prints an explorer link; a second run with more than 1.5 MON is refused |
| C6 | `pnpm wallet-id <your email>` | Prints your console wallet's id and address; the address equals the one in `/operator` |
| C7 | Put `PRIVY_AGENT_WALLET_ID=<id from C6>` in `.env`. Start the demo server: `PORT=8787 QUOTA_SERVER_ID=demo-search.quota pnpm --filter @quota/demo-mcp start`. In Chrome open `http://localhost:8787/health` | `{"ok":true,…,"slashing":false}` |
| C8 | Enroll an agent in the console with **limit 3** (stake 0.3 MON), say identity N. Then `pnpm --filter @quota/demo-mcp agent --identity N "monad" "merkle tree" "rate limit"` | Three `OK` lines with Wikipedia results; proofs about 0.4–2 s each. This is the same identity the console shows (verified equal for identities 0–2) |
| C9 | Run the agent again for identity N with one more query (the count persists in `apps/demo-mcp/data`) | The client refuses locally: `quota exhausted for this epoch` (it never reuses a message id by itself) |
| C10 | `--cheat` run on a **spare** identity (a slashed identity can never re-enroll): enroll another identity M in the console with limit 3, start the server with `QUOTA_SLASH=1` (needs a funded slasher: Dynamic wallet vars, or `SLASHER_PRIVATE_KEY` holding at least 0.3 MON; see README), then `pnpm --filter @quota/demo-mcp agent --identity M --cheat "q1" "q2" "q3" "q4"` | The last call is `REJECTED (violation)`; the server log shows `[violation]`, then commit and reveal hashes; in Chrome the explorer shows both transactions and the `Slashed` event; `/service` (S5 setup) shows the violation and slash rows; the agent shows `slashed` in `/operator` |
| C11 | `pnpm --filter @quota/scout start --scripted --identity <n>` (needs a server on 8787 and 8788, see README) | All four tools run (status, call, switch server; add `--topup` for the top-up) |
| C12 | Scout with a real model | **BLOCKED until Qwen (or another model) is configured**; mark BLOCKED |
| C13 | `pnpm --filter @quota/web exec tsx scripts/operator-e2e.mts` | All checks PASS (spends about 0.9 MON from the deployer; uses a software passkey and a fresh test user) |
| C14 | `pnpm phase3` | All checks PASS (slash e2e; spends about 0.15 MON plus slasher gas) |

## 6. When something fails

1. Re-run once (Monad reads can lag for a few seconds after a transaction; Privy signing is occasionally slow).
2. Capture: exact steps, the red message, DevTools Console and the failing Network response (redact tokens), and the transaction hash if any.
3. Add it to `chrome-test-report.md` under "Bugs" with a short title. Do not change the contracts or the registry address: the registry's domain and code are fixed.
