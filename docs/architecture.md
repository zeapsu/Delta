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
| `deploy/` | systemd units for a bare-metal install (edit before use) |

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
- **Plaid errors are never logged raw.** Axios errors carry the request body, including secrets and access tokens; only `error_code`, `error_code_reason` and `request_id` get logged.

## Design system

Neutral black/white "liquid glass" chrome. Color carries meaning only: category identity, money in vs out, and status. Tokens live in `app/globals.css`; page scaffolding (`Page`, `Card`, `Stat` and friends) in `app/ui.tsx`. Charts use recharts as client islands in `app/charts.tsx`.

For the full list of conventions and gotchas, see [`AGENTS.md`](https://github.com/zeapsu/Delta/blob/main/AGENTS.md) in the repo.
