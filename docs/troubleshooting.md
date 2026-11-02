---
title: Troubleshooting
---

# Troubleshooting

## The welcome page says my Plaid keys are missing or rejected

Delta checks the keys at startup and logs `[delta] Plaid <env>: keys OK` when they work.

- Entered the keys in the browser? Open **Settings → Plaid → Replace** and paste them again. The secret must match the environment you picked (Sandbox or Production).
- Using `.env`? Make sure `PLAID_CLIENT_ID` and the secret for your `PLAID_ENV` (`PLAID_SANDBOX_SECRET` or `PLAID_PRODUCTION_SECRET`) are there, then restart (`docker compose up -d`).

## I linked an account but see no transactions

The first pull from Plaid can take a minute or two. Press the sync icon next to the connection on the overview, or wait for the next scheduled sync.

Brokerage and retirement accounts never show rows on the Transactions page. Their activity is on the Investments page.

## A connection shows a red Reconnect button

The bank wants you to sign in again (for example after a password change or an expired consent). Click **Reconnect** and finish Plaid Link; nothing is lost. An amber dot instead means the last sync hit a temporary error, which usually clears on the next run.

## Investments page asks me to grant access

The connection was linked without investments consent. Click **Grant investments access** to add it in Plaid Link; you don't need to re-link.

## "Could not start Plaid Link" or "Sync failed" from my phone

Pages load but every action fails: the API is refusing your requests as coming from outside the allowed networks. On Linux with Tailscale this is usually Docker NATing tailnet traffic so it no longer arrives from your device's `100.x` address. Switch to host networking, see [Linux with Tailscale](self-hosting.md#linux-with-tailscale-use-host-networking). On Docker Desktop for macOS, see [the macOS note](self-hosting.md#docker-desktop-on-macos).

## My agent gets 401 or 403

- `401`: the token is missing, mistyped or revoked. Run `npm run token -- list` and create a new one if needed.
- `403`: either the token is read-only and the agent tried to write (create one with `--scope write`), or the request came from outside the allowed networks. Check that the agent's machine is on your tailnet, or add its network to `DELTA_ALLOWED_NETWORKS`. On Docker, see [Linux with Tailscale](self-hosting.md#linux-with-tailscale-use-host-networking) or, on macOS, [the Docker Desktop note](self-hosting.md#docker-desktop-on-macos).

## The data looks stale

Agents warn when the newest data is more than 3 days old. Check the `jobs` container (`docker compose logs jobs`) or your timers, and look for connection errors on the overview. Banks themselves only update transactions a few times a day, while balances are live.

## The Ask button says "Copy failed"

Some browsers refuse to copy from a plain-http page. Select the text on the card and copy it by hand.

## The container doesn't start after a reboot

If `DELTA_BIND` is a Tailscale IP, Docker may have started before Tailscale. See [Boot order with Tailscale](self-hosting.md#boot-order-with-tailscale).
