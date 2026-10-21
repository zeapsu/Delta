---
name: delta-finance
description: Analyze personal finances in the Delta app — spending, trends, recurring charges, budgets, net worth — via read-only SQLite access, and offer grounded advice. Use when the user asks about their money, spending, budgets, subscriptions, or net worth.
---

# Delta finance analysis

Delta is a personal finance app that syncs bank data via Plaid into a local SQLite database. This skill teaches you to query that data read-only, run standard analyses, and give advice grounded in the numbers.

## Hard rules (read first)

- **Never read `items.access_token`.** The `items` table holds a Plaid API secret. Only ever select `id`, `institution_name`, `created_at` from `items`. Never `SELECT *` from `items`. If anything token-shaped (`access-...`) ever appears in output, do not repeat it.
- **Never write to the database directly.** The only permitted writes are the budgets and recurring APIs (below). Everything else is read-only.
- **Never call `/api/plaid/*` endpoints.** They handle credentials and syncing; they are not for agents.

## Data access

**Read** — open the SQLite database read-only (safe while the app is running; it uses WAL mode):

```
sqlite3 -readonly "file:${DATABASE_PATH:-./delta.db}?mode=ro" "<sql>"
```

`DATABASE_PATH` is the same env var the app uses. Table and column reference: [references/schema.md](references/schema.md). Canonical copy-paste queries for every analysis: [references/queries.md](references/queries.md) — prefer these over writing SQL from scratch.

**Write (budgets only)** — via the app's validated API at `${DELTA_URL:-http://localhost:3000}`:

- `POST /api/budgets` with JSON `{"category": "FOOD_AND_DRINK", "monthlyAmount": 50000}` — upserts a monthly budget. `category` must match `^[A-Z_]{1,64}$` (Plaid primary category); `monthlyAmount` is a positive integer in cents, ≤ 100,000,000. Returns `{"ok": true}` or 400.
- `DELETE /api/budgets` with JSON `{"category": "FOOD_AND_DRINK"}` — removes it (404 if absent).
- `GET /api/budgets` — lists budgets (or just query the `budgets` table).

**Write (recurring rules)** — user-confirmed recurring series live in `recurring_rules`; the app's heuristic only *suggests* (see query 7 notes). Same base URL:

- `POST /api/recurring` with JSON `{"status": "confirmed", "name": "Netflix", "amount": 1549, "gapDays": 30, "anchorDate": "2026-07-08", "matchKey": "netflix"}` — creates a rule. `status` is `"confirmed"` or `"dismissed"` (dismissed suppresses a suggestion); `name` 1–200 chars; `amount` positive integer cents ≤ 100,000,000; `gapDays` integer 1–1000 (days between charges); `anchorDate` ISO `yyyy-mm-dd` (last known/expected charge); `matchKey` optional (the detector's group key — omit for manual entries). Returns `{"ok": true}` or 400.
- `PUT /api/recurring` with JSON `{"id": 3, "name": ..., "amount": ..., "gapDays": ..., "anchorDate": ...}` — edits a rule (404 if absent).
- `DELETE /api/recurring` with JSON `{"id": 3}` — removes it (this is how a canceled subscription is recorded).
- `GET /api/recurring` — lists rules (or just query the `recurring_rules` table).

## Conventions (sign/unit gotchas)

- All money is **integer cents**. Divide by 100 for display.
- Transaction `amount` uses the Plaid sign convention: **positive = money out** (spend), negative = money in (income, refunds).
- "Spend" **excludes** `category LIKE 'TRANSFER%'` and `category = 'INCOME'` (moving money between own accounts isn't spend) but **includes** rows with `category IS NULL`.
- `credit` and `loan` account balances are **positive amounts owed** — negate them when computing net worth.
- `transactions.date` is ISO text `yyyy-mm-dd`; slice months with `date LIKE 'YYYY-MM-%'`. Timestamps elsewhere are milliseconds since epoch.
- `pending = 1` transactions may still change or disappear; exclude them when reconciling against statements.
- Balance snapshots are per sync run; bucket by day taking the latest per account per day (the queries file does this).
- Investment buys/sells live in `investment_transactions` (not `transactions`) and are never counted as spend.

## Analysis methodology

**Always run the freshness check first** (query 1). If the latest transaction or snapshot is more than ~3 days old, say so and caveat every conclusion with "data last synced <date>".

| Question | Query | Interpretation notes |
|---|---|---|
| Where did the money go this month? | 2 — spending by category | Compare against the 3-month average (query 3 per category); flag categories >20% above it. |
| Is spending trending up or down? | 3 — monthly trend | One month is noise; call it a trend only with ≥3 months of movement. Current month is partial. |
| What subscriptions/recurring charges exist? | 7 — confirmed recurring rules | `recurring_rules` rows with `status='confirmed'` are user-reviewed truth — use them directly. The SQL heuristic in query 7 (and the app's detector, `lib/recurring.ts`) only produces *candidate suggestions* the user hasn't reviewed. |
| Am I over budget? | 6 — budget vs actual | ≥80% mid-month deserves a heads-up; >100% is over. Refunds (negative amounts) reduce spend. |
| What am I worth right now? | 4 — net worth now | Matches the dashboard headline. Null balances are excluded. |
| How has net worth changed? | 5 — net worth over time | The app forward-fills missing per-account days in JS (`lib/networth.ts`); the raw SQL here does not, so a day where one account lacks a snapshot can show a false dip when you query directly — check account coverage before explaining a dip. |
| Find specific transactions | 8 — search | Case-insensitive LIKE over name and merchant. |

## Advice guidelines

- **Ground every claim in a query you just ran** and quote the actual numbers. Never estimate from memory or extrapolate beyond the data.
- **Stay in scope:** budgeting, spending patterns, subscription cleanup, and cash-flow observations — yes. **No specific investment, securities, tax, or legal advice**; offer general principles at most and recommend a professional for those.
- Categories are Plaid's automatic labels and can be wrong — sanity-check surprising numbers by listing the underlying transactions before drawing conclusions.
- Recommendations are suggestions. **Only write a budget or recurring rule after the user explicitly agrees**, and only via the `/api/budgets` and `/api/recurring` routes.
- This data is private and stays local. Never send raw transaction dumps to third-party services, and don't surface account masks or numbers unless the user asks.

## Installing this skill

**Any Claude-compatible agent:** symlink the skill directory so `git pull` keeps it current (copy if your agent doesn't follow symlinks):

```
ln -s /path/to/Delta/skills/delta-finance ~/.claude/skills/delta-finance
```

**Any other agent:** this file and `references/` are plain markdown — put SKILL.md in the agent's context and let it read the reference files on demand.

**Environment:** set `DATABASE_PATH` to the absolute path of `delta.db` (defaults to `./delta.db`) and `DELTA_URL` to the app's URL (defaults to `http://localhost:3000`; on the deployed Jetson the server binds to the tailscale IP only, so `DELTA_URL` must be `http://<tailscale-ip>:3000` — localhost won't answer).
