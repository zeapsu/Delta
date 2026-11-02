---
title: One-click install
---

# One-click install (no terminal)

If your home server already runs an app panel such as **Portainer**, **CasaOS**, **Dockge**, **Synology Container Manager** or **Unraid**, you can install Delta by pasting one file into it. There's nothing to fill in first: on your first visit Delta asks for your Plaid keys in the browser.

Prefer a terminal? The [one-command install](self-hosting.md#the-short-way) does the same with `curl … | bash`.

## Before you start

- **A machine that runs Docker**, on 64-bit Intel/AMD or ARM (a Raspberry Pi 4/5 works), with one of the panels below.
- **A Plaid account.** It's free for personal use. [Set up Plaid's free Trial plan](plaid-trial.md) explains it; for now you only need your `client_id` and **Sandbox** secret from [Developers → Keys](https://dashboard.plaid.com/developers/keys).
- **A private network.** Delta has no login: anyone who can open its page sees your finances. Run it on your home network or [Tailscale](https://tailscale.com), and never port-forward it to the internet. See the [security model](self-hosting.md#security-model-read-this-first).

## 1. Add Delta to your panel

Every panel below uses the same file, [`one-click/compose.yaml`](https://github.com/zeapsu/Delta/blob/main/one-click/compose.yaml). Open the [raw file](https://raw.githubusercontent.com/zeapsu/Delta/main/one-click/compose.yaml), select all and copy it.

### Portainer

1. Open **Stacks → Add stack** and name it `delta`.
2. Pick **Repository** and enter `https://github.com/zeapsu/Delta` as the URL and `one-click/compose.yaml` as the compose path. (Or pick **Web editor** and paste the file.)
3. Click **Deploy the stack**.

The Repository option makes updates one click later.

### CasaOS

1. Open the **App Store**, then **Custom Install** (the **+** in the top corner).
2. Click **Import**, paste the file and click **Submit**.
3. Click **Install**. Delta appears on your dashboard.

### Dockge

1. Click **+ Compose** and name the stack `delta`.
2. Paste the file into the editor and click **Deploy**.

### Synology Container Manager

1. Open **Project → Create**, name it `delta` and pick a folder for it.
2. Choose **Create docker-compose.yml**, paste the file, then **Next** and **Done**.

### Unraid

1. Install the **Docker Compose Manager** plugin from Community Applications.
2. In **Docker → Compose**, click **Add New Stack**, name it `delta`, then **Edit Stack → Compose File**, paste the file and save.
3. Click **Compose Up**.

### Any other Docker host

Coolify, Komodo and others accept the same compose file. Or, from a terminal:

```bash
curl -fsSLO https://raw.githubusercontent.com/zeapsu/Delta/main/one-click/compose.yaml
docker compose -f compose.yaml up -d
```

## 2. Finish setup in your browser

1. Open `http://<your server's address>:3000`, for example `http://192.168.1.20:3000` (the address you open your panel at, with port 3000).
2. Click **Set up Plaid**, choose **Sandbox**, paste your `client_id` and Sandbox secret, and click **Check and save**. Delta checks the keys with Plaid before saving them.
3. Click **Connect account**. In sandbox, pick any bank and sign in with `user_good` / `pass_good`.

Delta syncs every 6 hours and backs up its database once a day on its own.

When you're ready for your real accounts, [get production access](plaid-trial.md) (free for up to 10 banks) and start a fresh install: remove the stack **and its volume**, deploy again, and choose **Production** on the setup page. Sandbox and production data don't mix, so Delta won't switch an install that already has banks linked.

Your keys are stored in Delta's database on your server, next to your bank connections. They're never shown again; **Settings → Plaid → Replace keys** swaps them.

## 3. Optional settings

The panel's environment (or variables) section can change these. All are optional.

| Variable | Default | What it does |
| --- | --- | --- |
| `DELTA_PORT` | `3000` | Port Delta is published on |
| `DELTA_URL` | | How agents reach Delta, e.g. `http://192.168.1.20:3000`. Used in the configs from [Connect an agent](#connect-an-agent) |
| `DELTA_ALLOWED_NETWORKS` | home, Docker and Tailscale ranges | Who may use Delta's API (Plaid Link, sync, agents). Narrow it to your own network, e.g. `192.168.1.0/24` |
| `DELTA_TAG` | `latest` | Image version to run |

## Update

Delta shows an **Update** pill in its header when a new version is out. To update, have your panel pull the new image and recreate the stack:

- **Portainer:** open the stack and click **Pull and redeploy** (Repository stacks), or **Editor → Update the stack** with **Re-pull image and redeploy** turned on.
- **Dockge:** open the stack and click **Update**.
- **CasaOS, Synology, Unraid and others:** use the app's update or "pull and recreate" action, or recreate the stack.

Your data lives in the `delta-data` volume and survives updates; database migrations apply when Delta starts. Delta keeps 7 daily backups in that volume (`/data/backups`).

## Connect an agent

Agent tokens are created on the server. In your panel, open a **console** on the `delta` container (Portainer: **Containers → delta-delta-1 → Console**, shell `/bin/sh`) and run:

```bash
npm run token -- create my-agent                 # read-only
npm run token -- create my-agent --scope write   # can also set budgets, recurring rules, categories
```

It prints a token and ready-to-paste MCP configs. Set `DELTA_URL` first so the configs point at the right address. More in [Connect an agent](agents.md).

## Uninstall

Plaid bills per connected bank until it's removed, so disconnect first. In a console on the `delta` container:

```bash
npm run unlink -- --yes
```

Then remove the stack in your panel, and delete the `delta-data` volume to erase your data. [Uninstall Delta](uninstalling.md) has the details.

## Troubleshooting

- **The page doesn't open.** Check the containers are running in your panel and that you used port 3000 (or your `DELTA_PORT`).
- **"Could not start Plaid Link".** Delta refused the request as coming from outside `DELTA_ALLOWED_NETWORKS`. If you narrowed it, add the network your phone or laptop is on.
- **The setup page says the keys are rejected.** Copy them again from Plaid's [Keys page](https://dashboard.plaid.com/developers/keys), and make sure the secret matches the environment you picked (Sandbox or Production).
- More in [Troubleshooting](troubleshooting.md).
