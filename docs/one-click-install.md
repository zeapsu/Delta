---
title: One-click install
---

# One-click install

No terminal needed. Paste one file into your server's app panel, then add your Plaid keys in the browser.

Prefer a terminal? Use the [one-command install](self-hosting.md#the-short-way).

## You need

- A machine running Docker (64-bit Intel/AMD or ARM, e.g. a Raspberry Pi 4/5) with an app panel.
- Plaid keys: your `client_id` and **Sandbox** secret from [Developers → Keys](https://dashboard.plaid.com/developers/keys). Free for personal use ([details](plaid-trial.md)).
- A private network. Delta has no login, so anyone who can open it sees your finances. Use your home network or [Tailscale](https://tailscale.com), never port forwarding. [Security model](self-hosting.md#security-model-read-this-first).

## 1. Add Delta to your panel

Every panel uses the same file: [`one-click/compose.yaml`](https://raw.githubusercontent.com/zeapsu/Delta/main/one-click/compose.yaml). Copy it.

| Panel | Steps |
| --- | --- |
| **Portainer** | **Stacks → Add stack**, name `delta`. Choose **Repository** with URL `https://github.com/zeapsu/Delta` and path `one-click/compose.yaml` (easiest updates), or **Web editor** and paste. **Deploy the stack**. |
| **CasaOS** | **App Store → Custom Install** (+) **→ Import**, paste, **Submit**, **Install**. |
| **Dockge** | **+ Compose**, name `delta`, paste, **Deploy**. |
| **Synology** | Container Manager: **Project → Create**, name `delta`, **Create docker-compose.yml**, paste, **Next**, **Done**. |
| **Unraid** | Install **Docker Compose Manager**. **Docker → Compose → Add New Stack**, name `delta`, **Edit Stack → Compose File**, paste, **Compose Up**. |

Coolify, Komodo and other compose-based panels work the same way. Or from a terminal:

```bash
curl -fsSLO https://raw.githubusercontent.com/zeapsu/Delta/main/one-click/compose.yaml
docker compose -f compose.yaml up -d
```

## 2. Finish in the browser

1. Open `http://<server address>:3000`, for example `http://192.168.1.20:3000`.
2. **Set up** → **Sandbox** → paste your keys → **Save**. Delta checks them with Plaid first.
3. **Connect account**. Sandbox login: `user_good` / `pass_good`.

Delta then syncs every 6 hours and backs up daily.

**Going live:** get [production access](plaid-trial.md), then reinstall fresh (remove the stack **and** its volume) and choose **Production**. Sandbox and production data don't mix, so the environment is locked once a bank is linked.

Keys are stored in Delta's database on your server and never shown again. **Settings → Plaid → Replace** swaps them.

## Optional settings

Set these in your panel's environment section.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DELTA_PORT` | `3000` | Published port |
| `DELTA_URL` | | Address agents use, e.g. `http://192.168.1.20:3000` |
| `DELTA_ALLOWED_NETWORKS` | private ranges + Tailscale | Who may use the API. Narrow to e.g. `192.168.1.0/24` |
| `DELTA_TAG` | `latest` | Image version |

## Update

An **Update** pill appears in Delta's header when there's a new version. Pull the new image and recreate the stack:

- **Portainer:** **Pull and redeploy** (Repository stacks), or **Editor → Update the stack** with **Re-pull image** on.
- **Dockge:** **Update**.
- **Others:** the app's update or "pull and recreate" action.

Data lives in the `delta-data` volume and survives updates. Delta keeps 7 daily backups in `/data/backups`.

## Connect an agent

Open a console on the `delta` container (Portainer: **Containers → delta-delta-1 → Console**, `/bin/sh`), then:

```bash
npm run token -- create my-agent                 # read-only
npm run token -- create my-agent --scope write   # can also edit budgets, recurring, categories
```

It prints a token and MCP configs to paste. Set `DELTA_URL` first. More in [Connect an agent](agents.md).

## Uninstall

Plaid bills per connected bank until it's removed, so disconnect first. In the `delta` container's console:

```bash
npm run unlink -- --yes
```

Then remove the stack, and delete the `delta-data` volume to erase your data. Details: [Uninstall Delta](uninstalling.md).

## Troubleshooting

- **Page won't open:** check the containers are running and the port is 3000 (or your `DELTA_PORT`).
- **"Could not start Plaid Link":** your device's network isn't in `DELTA_ALLOWED_NETWORKS`.
- **Keys rejected:** copy them again, and check the secret matches the environment you picked.
- More in [Troubleshooting](troubleshooting.md).
