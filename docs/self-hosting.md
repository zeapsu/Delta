# Self-hosting Delta

Delta is a single-user app: you run your own copy, on your own machine, with your own Plaid keys. The Delta authors never see your data. Plaid handles your bank login, and an agent sees only what its token allows.

About 15 minutes for a sandbox instance. Real banks also need Plaid to approve your account, which can take a few days.

| You need | Account | When |
| --- | --- | --- |
| [Docker](#1-install-docker) | None | Now |
| [Plaid keys](#2-get-plaid-keys) | Plaid (free) | Now, or paste them in the browser after install |
| [Tailscale](#use-it-on-your-phone-tailscale) | Tailscale (free) | Only to use Delta from your phone |

## Security model: read this first

**Delta has no user accounts.** An optional [password](login.md) can lock the pages, but the network is still what keeps Delta private. The security model is:

1. **The network is the boundary.** Anyone who can reach Delta's port can see every page, including balances and transactions. A terminal install starts on this computer only (`127.0.0.1`). To reach it from other devices, use a private network you control. [Tailscale](https://tailscale.com) is the recommended one.
2. **API routes are also IP-filtered.** Every `/api/*` request must come from loopback or from `DELTA_ALLOWED_NETWORKS` (default: Tailscale's `100.64.0.0/10`), and cross-site browser writes are refused. The one opt-in exception is `DELTA_PUBLIC_MCP=1`, which lets `/api/v1/mcp` answer any network for internet-hosted agents ([Connect an agent](agents.md#agents-that-call-from-the-internet)).
3. **Agents use tokens.** The agent API (`/api/v1`, including the MCP server) also needs a per-agent bearer token, read or write scope, which you can revoke at any time.
4. **Plaid access tokens never leave the database.** No API route returns them.
5. **Optional password.** Settings → Password locks every page and the dashboard's routes behind a session cookie. [Password](login.md).

Never port-forward Delta to the public internet, and never put it behind a public reverse proxy. The password is a second lock, not a reason to expose Delta.

## 1. Install Docker

- **Mac or Windows:** download [Docker Desktop](https://www.docker.com/products/docker-desktop/) and open it. Skip the sign-in: Delta needs no Docker account. Wait until it shows **Engine running**.
- **Linux** (amd64 or arm64, so a Raspberry Pi 4/5 or a Jetson works): install [Docker Engine](https://docs.docker.com/engine/install/), then let your user run it: `sudo usermod -aG docker $USER` and log in again.

Check it works: `docker compose version`.

Using an app panel such as Portainer, CasaOS, Dockge, Synology Container Manager or Unraid? Follow [Home server app](home-server.md) instead: no terminal, and the Plaid keys go in through the browser. Have [Homebrew](https://brew.sh)? [Install with Homebrew](homebrew.md) needs no Docker.

## 2. Get Plaid keys

Delta talks to banks through [Plaid](https://plaid.com). You can paste the keys in the terminal during install, or skip that and paste them on Delta's setup page.

For personal use, Plaid's free **Trial plan** connects up to 10 real bank logins. [Set up Plaid's free Trial plan](plaid-trial.md) walks through signing up, the limits, and switching from sandbox to your real accounts. The short version:

1. Sign up at [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup). Pick the free tier when asked; you're a developer building for yourself.
2. Open **Developers → Keys** ([dashboard.plaid.com/developers/keys](https://dashboard.plaid.com/developers/keys)). Copy your `client_id` and your **Sandbox** secret. (The Production secret appears once production access is granted.)

### Sandbox vs production

- **Sandbox** (`PLAID_ENV=sandbox`) uses fake banks. Sign in to any institution with `user_good` / `pass_good`. It's free and needs no approval, so start here to check your setup.
- **Production** (`PLAID_ENV=production`) links your real accounts. New US and Canadian accounts get it through the free Trial plan (up to 10 Items, usually approved automatically). Big OAuth banks such as Chase can take 6 to 24 hours after approval to appear in Link. See [the Trial guide](plaid-trial.md).
- Paid plans bill per connected Item; you only need one past 10 connections. Check your plan in the dashboard.
- Don't switch an existing database between sandbox and production. Sandbox items don't work against production and the fake data would mix with your real data. Start production with a fresh volume (or a fresh `DATABASE_PATH`).

Delta uses the `transactions` product and, optionally, `investments`. Both need to be enabled for your Plaid account.

## 3. Run it with Docker

### Terminal install

```bash
curl -fsSL https://raw.githubusercontent.com/zeapsu/Delta/main/delta.sh | bash -s install
```

This clones Delta into `./delta`, asks for your Plaid client id and sandbox secret (press Enter to skip and paste them on Delta's setup page instead), writes `.env`, starts the containers and opens Delta in your browser. Already cloned? Run `./delta.sh install` in the folder instead.

- **Mac:** Delta starts on this computer only, at `http://127.0.0.1:3000`. Add your phone later with [`./delta.sh phone`](#use-it-on-your-phone-tailscale).
- **Linux:** if Tailscale is running, Delta goes straight onto your Tailscale IP with [host networking](#linux-with-tailscale-use-host-networking), since a server is usually headless. Otherwise it starts on this computer only.

The same script later runs [`update`](updating.md) and [`uninstall`](uninstalling.md).

Next: [link your accounts](#4-link-your-accounts). Prefer to set it up yourself? See [Install by hand](#install-by-hand) instead.

## 4. Link your accounts

On the home page, click **Connect account** and go through Plaid Link. In sandbox, pick any bank and sign in with `user_good` / `pass_good`. The first sync starts right away; the first pull of transactions can take a minute to show up.

When a bank needs you to sign in again, its sync control on the overview turns into a red **Reconnect** button.

## 5. Connect an agent

Delta has no chat of its own. You use your own agent (Claude, or any MCP client) and give it a token.

In Delta, open **Settings → Agents**, name the agent, pick **Read** or **Read + edit** (also budgets, recurring rules, categories), and click **Create token**. Delta shows the token once, inside paste-ready configs for Claude Code, JSON-configured MCP clients and stdio-only clients, all pointed at `DELTA_URL`. Paste one into your agent. Revoke tokens there too.

From a terminal instead:

```bash
docker compose exec delta npm run token -- create my-agent                 # read-only
docker compose exec delta npm run token -- create my-agent --scope write   # can also set budgets, recurring rules, categories
docker compose exec delta npm run token -- list
docker compose exec delta npm run token -- revoke <id>
```

The agent's machine must reach `DELTA_URL`: the same computer, or a device on your tailnet.

Prefer plain HTTP? The same token works on the REST API: `curl -H "Authorization: Bearer dlt_..." $DELTA_URL/api/v1` describes every endpoint.

## Use it on your phone (Tailscale)

Tailscale puts your devices on one private network, so your phone reaches Delta without exposing it to the internet.

1. Install Tailscale on the computer running Delta and on your phone: [tailscale.com/download](https://tailscale.com/download).
2. Sign in on both with the same account.
3. In your Delta folder, run `./delta.sh phone`.

It finds the computer's Tailscale IP (`100.x.y.z`), moves Delta onto it and prints the new address, `http://100.x.y.z:3000`. Open that on your phone. Traffic between your devices is already encrypted by Tailscale, so plain `http` is fine. Delta then answers only on that address, so update any agent set up with `127.0.0.1`. **Settings → Use on your phone** shows the same steps.

Not using Tailscale? Any private network works. Set `DELTA_BIND` to the interface's address and `DELTA_ALLOWED_NETWORKS` to its CIDR (for example `192.168.1.0/24`).

## 6. Backups

The `jobs` container writes a backup to `/data/backups/` once a day and keeps the last 7. Those backups sit in the same volume as the database, so they protect against a bad migration or a mistake, not against losing the disk. Copy them off the machine regularly:

```bash
docker compose cp delta:/data/backups/. ./delta-backups/
```

Each backup is a self-contained SQLite file (`sqlite3 delta-2026-10-31.db` opens it directly). The database holds your Plaid access tokens, so store backups somewhere private.

To restore, stop Delta, swap the backup in with a one-off container, and start again. Run this from the folder that holds the backup file:

```bash
docker compose stop
docker compose run --rm --no-deps --user root -v "$PWD:/restore:ro" --entrypoint sh delta -c \
  'rm -f /data/delta.db-wal /data/delta.db-shm && cp /restore/delta-2026-10-31.db /data/delta.db && chown node:node /data/delta.db'
docker compose start
```

This deletes the old write-ahead log first, so it can't be replayed onto the restored file, and hands the file to the `node` user the app runs as. (A plain `docker compose cp` into the container leaves a root-owned file the app can't write to.)

## Install by hand

Skip this if you used the terminal install. It does these steps for you.

```bash
git clone https://github.com/zeapsu/Delta.git delta
cd delta
cp .env.example .env
```

Edit `.env` (the Plaid lines can stay empty: Delta then asks for the keys on its setup page, `/setup`):

```bash
PLAID_CLIENT_ID=your-client-id
PLAID_SANDBOX_SECRET=your-sandbox-secret
PLAID_ENV=sandbox
DELTA_BIND=127.0.0.1                # this computer only (or your Tailscale IP)
DELTA_URL=http://127.0.0.1:3000     # how agents and browsers reach it
DELTA_ALLOWED_NETWORKS=0.0.0.0/0    # see below
```

Docker hides the browser's address behind its own when the port is published on `127.0.0.1` (and always on Docker Desktop), so `/api` would refuse your browser. With those binds, allow all networks: the bind is what keeps the port private. On Linux with a Tailscale IP, use [host networking](#linux-with-tailscale-use-host-networking) instead and keep the default.

Then start it:

```bash
docker compose up -d --build     # build from this checkout
# or, if a prebuilt image is published for you:
docker compose pull && docker compose up -d
```

This starts two containers from the same image:

- `delta`, the web app. The database and backups live in the `delta-data` volume (`/data` in the container). Migrations apply automatically each time it starts.
- `jobs`, which replaces the cron/systemd timers: every 6 hours it asks Plaid to refresh, waits 3 minutes, then syncs; once a day it backs up the database. It shares `delta`'s network so its requests arrive on loopback.

Check it started:

```bash
docker compose logs delta   # look for "[delta] Plaid sandbox: keys OK"
docker compose logs jobs
```

Open `DELTA_URL` in your browser.

### Linux with Tailscale: use host networking

On Linux, publishing the port can hide where a request really came from: Docker may NAT your phone's tailnet traffic so it reaches the container from a Docker-internal address instead of its `100.x.y.z` address. Pages still load, but every API call is refused as coming from outside the tailnet, so you see **Could not start Plaid Link** or **Sync failed**.

The fix is to run Delta on the host network, listening only on your Tailscale IP. The repo ships an override for it, `docker-compose.tailscale.yml`. Turn it on by adding one line to `.env`, which makes every `docker compose` command use it:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.tailscale.yml
```

Then recreate the containers:

```bash
docker compose up -d --build
```

With the override, `delta` drops the published port and runs `next start -H $DELTA_BIND`, so it answers on your Tailscale IP only (not on your LAN or the public interface), and `jobs` reaches it on that IP instead of loopback. `DELTA_BIND` must be your Tailscale IP. It needs Docker Compose 2.24 or newer (`docker compose version`).

To check it worked, open Delta from your phone and click **Connect account** (under Accounts on Overview). If Plaid Link opens, the API sees your real tailnet address.

### First-run check

At startup Delta logs which Plaid environment is active and whether the keys work (it makes one cheap authenticated call to Plaid). The welcome page shows the same thing before you've linked anything. If it says the keys are missing or rejected, fix `.env` and run `docker compose up -d` again.

### Plaid keys from the browser

If `.env` has no `PLAID_CLIENT_ID`, the welcome page starts with **Add Plaid keys → Set up**: paste the client id and a secret, pick sandbox or production, and Delta checks them with Plaid before saving them in its database (the same database that holds your Plaid access tokens, so it's in your backups too). They're never shown again; **Settings → Plaid → Replace** swaps them, and the environment can't change once a bank is linked. Keys in `.env` always win, and the setup page only shows them.

### Boot order with Tailscale

When `DELTA_BIND` is a Tailscale IP, Docker can only publish the port (or, with host networking, Delta can only listen) once Tailscale has brought that IP up. If Docker wins the race at boot, the `delta` container fails to start; `docker compose up -d` fixes it. To make it hands-off, have Docker start after Tailscale (`sudo systemctl edit docker.service`, then add `After=tailscaled.service` and `Wants=tailscaled.service` under `[Unit]`).

### Docker Desktop on macOS

Docker Desktop rewrites the source address of incoming connections, so API requests arrive from a Docker-internal address and get refused. Host networking doesn't help there (Docker Desktop runs containers in a VM), so set `DELTA_ALLOWED_NETWORKS=0.0.0.0/0` instead and rely on `DELTA_BIND` (`127.0.0.1` or your Tailscale IP) to keep the port private. `delta.sh` does this for you.

## Updating and uninstalling

See [Update Delta](updating.md) (back up, pull the new version, roll back if needed) and [Uninstall Delta](uninstalling.md) (disconnect your banks at Plaid first, then remove the containers and data).

## Configuration reference

All settings go in `.env`. The Plaid keys can instead be entered on the setup page ([above](#plaid-keys-from-the-browser)); `.env` wins when both are set.

| Variable | Default | What it does |
| --- | --- | --- |
| `PLAID_CLIENT_ID` | | Plaid client id |
| `PLAID_SANDBOX_SECRET` | | Sandbox secret |
| `PLAID_PRODUCTION_SECRET` | | Production secret |
| `PLAID_ENV` | `sandbox` | `sandbox` or `production` |
| `TZ` | system (UTC in Docker) | Time zone for dates: today, this month, the greeting. **Settings → You** overrides it. `delta.sh install` copies your computer's |
| `DELTA_URL` | `http://localhost:3000` | The address browsers and agents use, shown in agent configs |
| `DELTA_ALLOWED_NETWORKS` | `100.64.0.0/10` | Comma-separated IPv4 CIDRs allowed to call `/api`. Loopback is always allowed. `0.0.0.0/0` when Docker hides the browser's address (bind `127.0.0.1`, Docker Desktop) |
| `DELTA_BIND` | `127.0.0.1` | Docker: host interface the port is published on |
| `DELTA_PORT` | `3000` | Docker: host port |
| `COMPOSE_FILE` | | Docker: set to `docker-compose.yml:docker-compose.tailscale.yml` for [host networking on Linux](#linux-with-tailscale-use-host-networking) |
| `DELTA_TAG` | `latest` | Docker: image tag to run; pin a release or `sha-<commit>` to [roll back](updating.md#roll-back) |
| `DELTA_UPDATE_CHECK` | on | Set to `off` to stop the twice-daily GitHub check behind the [Update pill](updating.md) |
| `SYNC_INTERVAL_HOURS` | `6` | Docker: how often `jobs` refreshes and syncs |
| `REFRESH_WAIT_SECONDS` | `180` | Docker: wait between the refresh request and the sync |
| `BACKUP_INTERVAL_HOURS` | `24` | Docker: how often `jobs` backs up |
| `DATABASE_PATH` | `./delta.db` (`/data/delta.db` in Docker) | SQLite file; backups go in `backups/` next to it |

## Without Docker

Delta is a plain Next.js app: Node 20.9 or newer, then `npm ci && npm run build && npx next start -H <your tailscale ip>`. Put the same variables in `.env` in the repo root. You then need to schedule the sync and backups yourself; `deploy/` has the systemd units the author uses on a Jetson (they hardcode that machine's user, paths and IP, so edit them before installing).
