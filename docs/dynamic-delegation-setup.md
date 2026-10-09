# Dynamic delegated access: setup

What this adds: a service operator signs in on `/slasher` with a **Dynamic embedded wallet** and approves **delegated access**. Dynamic then sends our server an encrypted webhook, and the demo server signs slashes from the operator's own wallet (the reward lands there). Revoking removes the rights.

Code: `packages/wallets/src/dynamic-delegated.ts` (verify, decrypt, encrypted store, delegated wallet), `apps/demo-mcp/src/server.ts` (`POST /dynamic/webhook`, routing), `apps/web/app/slasher/` (the page). Tests: `packages/wallets/test/dynamic-delegated.test.ts`.

## 1. Dynamic dashboard (app.dynamic.xyz, your environment)

Do these in order. The environment id is the one already in `.env` as `DYNAMIC_ENVIRONMENT_ID`.

1. **Sign-in methods:** turn on **Email** (one-time code).
2. **Wallets / Embedded wallets:** turn on embedded wallets (MPC / WaaS) and enable the **EVM** chain.
3. **Security → Allowed origins:** add `https://quota-metro.vercel.app` and `http://localhost:3000`.
4. **Embedded Wallets → Delegated Access:** switch it **on**. Leave "Require delegation" off and "Prompt users on sign in" off (the `/slasher` page asks explicitly).
5. **Encryption key:** choose to **supply your own RSA public key** and paste the contents of [`dynamic-delegation-public-key.pem`](dynamic-delegation-public-key.pem). The matching private key is already in your local `.env` (`DYNAMIC_DELEGATION_PRIVATE_KEY`) and is never committed.
6. **Webhook:** add `https://quota-demo-mcp.onrender.com/dynamic/webhook` with the events `wallet.delegation.created` and `wallet.delegation.revoked`. The URL must answer the dashboard's check: it does (unsigned pings get `200`).
7. Open the webhook's detail page and copy its **signing secret**. Put it in `.env` as `DYNAMIC_WEBHOOK_SECRET=...` (do not paste it into chat or a commit).

## 2. Hosts

- **Vercel:** add the environment variable `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` (the same id; it is public by design) and redeploy.
- **Render** (the demo server): needs `DYNAMIC_WEBHOOK_SECRET` and `DYNAMIC_DELEGATION_PRIVATE_KEY` in addition to the existing `DYNAMIC_ENVIRONMENT_ID`, `DYNAMIC_API_TOKEN`, `DYNAMIC_WALLET_PASSWORD`, `QUOTA_SLASH=1`. Set them from `.env` through the Render API (see HANDOFF §0c) and trigger a deploy.

## 3. Try it

1. Open `/slasher`, sign in with an email code, wait for the wallet address.
2. Fund that address with about 0.5 MON (faucet or `pnpm fund <address> 0.5`).
3. Click **Approve delegation**. Within seconds `/slasher` and `/service` show "Slashing from your wallet 0x…".
4. Run the cheat demo (HANDOFF flow 7, step 5) on a spare identity. The commit and reveal transactions are sent **from your embedded wallet**, and half the stake arrives in it.
5. Click **Revoke delegation**: the server goes back to its own Dynamic server wallet.

## Verified

Evidence on Monad testnet (2026-10-09), two slashes whose commit and reveal were both sent from the operator's embedded wallet `0x48726d79b26f12178069bDf8b98579F9A26AfF8C`: (1) identity 1, commit `0x79ab567bbf082323ffcbac25158a81a09089b15ca88574fd7407ebb0f796cd3d` (block 69525686), reveal `0x9e6df76cc59287fb97ac9cd5690adbf1c0cae91b37f435968c6abf9922b695c4` (block 69525709); (2) identity 2, commit `0x1b8bfb3ffcb30ea57b3b9137cc0e5dfb1dfe3f35dfa06b036c7f25d773334489` (block 69526418), reveal `0xeff5b83f68c86678096fbbd753348b81881e0bc1b26d35b87d5c9c75f0a3c268` (block 69526439). All four `success`. The operator's wallet paid about 0.2 MON of gas and received half of the forfeited stake, so with stakes of 0.1 to 0.2 MON a delegated slasher runs at a small loss; it breaks even from a limit of about 5 (0.5 MON staked).

## Limits, stated plainly

- The delegation lives in the demo server's memory and an encrypted file (`delegations.enc.json`, key derived from `DYNAMIC_WALLET_PASSWORD`). Render's free plan resets its disk on each deploy, so after a deploy the operator must approve again. A database would remove that.
- If the delegated wallet holds less than 0.3 MON (`QUOTA_DELEGATED_MIN_MON`), slashes fall back to the server's own Dynamic wallet and the log says so.
- The latest delegation wins; there is one active delegated slasher at a time.
- Decryption and delegated signing need Dynamic's Linux-only native module, so they only run on Render (and are verified there, see above). The signature check, parsing, encrypted store and wallet adapter are also unit-tested (`packages/wallets/test/dynamic-delegated.test.ts`).
