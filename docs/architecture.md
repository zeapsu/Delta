---
title: Architecture
---

# Architecture

Delta is one Next.js app (App Router, TypeScript, Tailwind) with a SQLite database. There's no separate backend, queue or scheduler process: the app serves the dashboard and the APIs, and an external timer (the `jobs` container in Docker, systemd timers on bare metal) asks it to sync.

```
 bank ──► Plaid ──► /api/plaid/sync ──► SQLite (Drizzle) ──► dashboard pages (server components)
                         ▲                     │
           timer (every 6h, after refresh)     └──► /api/v1 ──► /api/v1/mcp ──► your agent
```

## Directory map

| Path | What's there |
| --- | --- |
| `app/` | Pages (async server components that query the DB directly), client islands (charts, forms, the Ask button) and API routes |
| `app/api/plaid/` | Link token, public token exchange, refresh and sync. Not for agents |
| `app/api/v1/` | Token-authenticated agent API and the MCP endpoint |
| `lib/` | Shared logic: sync engine (`sync.ts`), dashboard queries (`insights.ts`), recurring detection (`recurring.ts`), MCP protocol and tools (`mcp.ts`), analysis settings (`analysis.ts`, `settings.ts`), API auth (`api-auth.ts`, `api-tokens.ts`), network guard (`tailnet.ts`) |
| `db/` | Drizzle schema (`schema.ts`) and the DB singleton, which applies migrations on first import |
| `drizzle/` | Generated SQL migrations. Commit them with the schema change |
| `proxy.ts` | Runs on every `/api/*` request: network allowlist, cross-site write refusal, and bearer tokens for `/api/v1` |
| `scripts/` | Token CLI, backups, the Docker `jobs` loop |
| `e2e/` | Playwright end-to-end tests against a mock Plaid server (API, MCP and pages) |
| `docs/` | These docs. `website/` builds them with Docusaurus |
| `deploy/` | systemd units for an install without Docker (`deploy/install.sh`), and a macOS job that pulls backups off the server |

## Data model

- **Money is integer cents.** Transaction amounts keep Plaid's sign: positive = money out.
- **Timestamps** are stored as milliseconds; columns are snake_case in SQL and camelCase in TypeScript.
- `transactions.date` is the posted date and drives every total; `authorized_date` is the purchase date when the bank reports it.
- `transactions.category` is the effective label: your override, else a merchant rule, else Plaid's. It's materialized so every reader stays simple, and sync recomputes it.
- Credit and loan balances are stored as positive amounts owed; net worth negates them.

## Sync

`lib/sync.ts` runs `/transactions/sync` per connection (cursor-based), takes balance snapshots from `/accounts/balance/get`, and pulls investment activity with `/investments/transactions/get`. Each connection records its last sync time and error code, which the overview uses to show a sync control, an amber dot for a transient error, or a red Reconnect button when the bank needs you to sign in again. Runs are single-flight: a timer run and a button press share one sync.

## Trust boundaries

- **Network first, optional password.** The network is the boundary; `proxy.ts` refuses `/api/*` from outside loopback and `DELTA_ALLOWED_NETWORKS`, except `/api/v1/mcp` when `DELTA_PUBLIC_MCP=1` (token still required). Pages and dashboard routes also refuse a `Host` that is a public name Delta wasn't told about (`knownHost`, the DNS rebinding guard; `/api/v1` is exempt, a page can't supply its token). With a password set (`lib/login.ts`), it also sends pages to `/login` and answers 401 on dashboard routes without the session cookie; `/api/v1` keeps its tokens.
- **Agents are least-privilege.** `/api/v1` needs a token (only its sha256 is stored). Read tokens can't write, and v1 routes never select Plaid access tokens or sync cursors.
- **Writes go through validated routes only:** budgets, recurring rules and category relabels. The MCP layer never touches the DB; it calls the v1 handlers in-process.
- **Plaid errors are never logged raw.** Their body and message are whatever the server sent; only `error_code`, `error_code_reason` and `request_id` get logged (`safePlaidError()`).

## Updates from the app

The header's Update pill (`app/update-pill.tsx`) opens a dialog; with an updater available, **Update now** posts to `POST /api/update` (`lib/updater.ts`). Two backends share one contract, a `status.json` in `<data dir>/update/` (`state`: `idle`, `pulling`, `restarting`, `done`, `current` or `failed`, plus `at`, `requestedAt` and a short fixed `message`) that the dialog polls through `GET /api/update`.

- **Docker:** the app backs up, then creates an empty `request` file in that directory. The opt-in `updater` compose service (`scripts/updater.mjs`) polls for it every 2 seconds, pulls the image its own container uses, checks its signature, and starts a one-shot worker from the new image by id (`updater.mjs apply`). For `ghcr.io/zeapsu/delta` the check is `cosign verify` in a throwaway container from `COSIGN_IMAGE`, which gets the network and nothing else, against the identity `SIGNER_IDENTITY` (`scripts/updater-lib.mjs`); the merge job of `.github/workflows/docker.yml` signs the multi-arch digest with that same image and runs the same check. A refused image is never run: the tag goes back to the running image and the refused one is removed. The worker refuses to start if the tag no longer names the checked image. The worker, which is not one of the containers being replaced, recreates this compose project's containers that use the same image reference (`createBody` in `scripts/updater-lib.mjs` carries the user's settings over and lets the new image's defaults replace the old ones), verifies them for 20 seconds, and puts the old ones back if they don't stay up. The updater heartbeats `at` every 20 seconds, except while an update runs (the worker owns the file then); the app treats it as available when that is under 90 seconds old or an update is running. The updater and the worker run with a read-only filesystem.
- **Homebrew:** only under `brew services` (launchd or systemd, `delta start` records its pid). The app backs up, then starts `scripts/brew-update.mjs` detached: `brew upgrade delta`, then SIGTERM to `delta start`, which the service supervisor restarts on the new build. `done` is derived: a `restarting` status written by another version than the one answering.

The security boundary: the web app never gets the Docker socket. The updater is the only container that has it, with no network (the cosign container it starts has no socket and no mounts) and no port, and its only input is that a request exists: no parameters, no content. It pulls only its own image reference and touches only its own compose project. `POST /api/update` is dashboard only: behind the session login and the cross-site check like every `/api` route, and it refuses any request that carries a bearer token. `scripts/updater-check.mjs` and `scripts/brew-update-check.mjs` check the pure parts, and `e2e/updater-docker.sh` runs the updater against a real Docker daemon.

## Design system

Neutral black/white "liquid glass" chrome. Color carries meaning only: category identity, money in vs out, and status. Tokens live in `app/globals.css`; page scaffolding (`Page`, `Card`, `Stat` and friends) in `app/ui.tsx`. Charts use recharts as client islands in `app/charts.tsx`.

The core conventions are in [`CONTRIBUTING.md`](https://github.com/zeapsu/Delta/blob/main/CONTRIBUTING.md). For the gotchas that aren't written down anywhere else, see [`AGENTS.md`](https://github.com/zeapsu/Delta/blob/main/AGENTS.md) in the repo.
