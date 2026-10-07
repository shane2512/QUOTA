# QUOTA — Submission checklist and final-day runbook

Deadline **14 Oct 2026, 09:29 IST**. Plan: submit the evening of **13 Oct**. Status as of 2026-10-07. "Owner" items need the project owner's accounts or decisions.

## Deliverables

| Item | Status | Who | Notes |
|---|---|---|---|
| Public repo, readable by `metropolis@hackathon.monad.xyz` | **To confirm** | Owner | Open `github.com/shane2512/QUOTA` in a private window; if private, add that account as a collaborator |
| Live product on Monad + access instructions | **Built; browser test pending** | Collaborator | `https://quota-metro.vercel.app` (operator console, live service console); access steps are in the README ("Try it in the browser"). Needs the Chrome test plan run first |
| Test credentials for judges | **Open** | Owner | No account needed (any email works), but judges need test MON. Decide: tell them to use the faucet, and/or pre-fund a few wallets with `pnpm fund`; say so in the submission text |
| Technical demo video ≤ 3 min (live product, no slides) | Script ready | Owner + collaborator | [`demo-video-script.md`](demo-video-script.md); record **after** the Chrome test passes |
| Pitch video ≤ 2 min | Script ready | Owner | Needs team names and the integrator, if confirmed |
| Logo ≤ 3 MB (JPG/PNG/WEBP) | **Open** | Owner | Not made yet |
| Track 4 selected | Ready | Owner | Description: [`bounties.md`](bounties.md) |
| Privy bounty | **Claim** | Owner | Text in `bounties.md` |
| Dynamic bounty | **Claim, with stated limits** | Owner | Server wallet only; delegated access not done; text in `bounties.md` |
| Qwen bounty | **Do not claim unless a real run + article happen** | Owner | No key/credits so far; article is a draft with pending sections |
| Nansen, Cleanverse | **Cut** | — | Reasons in `gates.md` G5 / G4 |
| Monad Community Team | **Owner decision** | Owner | Needs the community group on the portal profile |
| Qwen article URL | N/A for now | Owner | Only if Qwen is claimed |
| Named external integrator, with evidence | **Open (most valuable gap)** | Owner | A PR, a running URL, or a written message from a team that runs the middleware |
| No secrets in the repo or history | **Clear on 2026-10-07** | Both | `pnpm scan:secrets` → ALL CLEAR (8 values, 47 commits). Re-run on submission day |

## Known security posture to disclose accurately

- Our contracts are **unaudited**; testnet only.
- The credentials pasted into chat on 2026-10-06 were rotated (Privy secret and authorization key now new). The **old Privy key quorum could not be deleted from the dashboard** and still exists; it can sign only registry-only transactions (value ≤ its policy cap) for three old wallets (`0x0cc2…4920`, `0x8F87…2576`, `0x1Ec0…1aA6`). Those wallets and their identities are not used, funded or referenced anywhere that matters. Do not mention them as "the agent wallet".
- Passkeys work only at `quota-metro.vercel.app`. The CLI and Scout use a **software** passkey stand-in (test tooling).

## Final-day runbook (13 Oct, evening)

Do these in order; stop and fix if any step fails.

1. **Freeze.** No feature work after the videos are recorded. Create a git tag at the submitted commit.
2. **Clean checkout test.** On a machine with no local changes: `git clone --recurse-submodules <repo>`, `pnpm install`, `pnpm typecheck && pnpm test`, `cd contracts && forge test`. Expect all green (counts are in `chrome-test-plan.md` C2/C3).
3. **Secrets:** `pnpm scan:secrets` → `ALL CLEAR`. Confirm `.env` is not tracked (`git ls-files | findstr .env` shows only `.env.example`).
4. **Production check** in a **private window**: `/`, `/docs`, `/demo`, `/service`, `/operator` load; `/service` shows a live block; `/api/operator/me` returns 401 when logged out.
5. **Chrome test report** (`chrome-test-report.md`): no FAIL on P, S, O, X rows; any BLOCKED row has a stated reason and is not claimed in the submission.
6. **Contracts:** the registry is verified on Sourcify (`https://sourcify.dev/server/v2/contract/10143/0xCBdfda8ebF4302793C06a402E9753C4F43799990` shows `match`).
7. **Docs honesty pass:** README, `bounties.md`, the video descriptions say testnet, unaudited, commit–reveal (not BTX), per-server quotas; nothing claims Qwen, Nansen or Cleanverse unless done.
8. **Every link** in the submission opens in a private window: repo, live site, both videos, logo.
9. **Submit** with at least two hours of buffer before the deadline. Screenshot the confirmation.

## What can still be cut
Order if time runs short: the 30 s ad → the Dynamic claim → anything marked "Owner decision". Never cut: the Chrome test, the secrets scan, the demo video, honest limits.
