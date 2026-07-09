---
name: delta-finance
description: Analyze personal finances in the Delta app — spending, trends, recurring charges, budgets, net worth — via read-only SQLite access, and offer grounded advice. Use when the user asks about their money, spending, budgets, subscriptions, or net worth.
---

# Delta finance analysis

Delta is a personal finance app that syncs bank data via Plaid into a local SQLite database. This skill teaches you to query that data read-only, run standard analyses, and give advice grounded in the numbers.

## Hard rules (read first)

- **Never read `items.access_token`.** The `items` table holds a Plaid API secret. Only ever select `id`, `institution_name`, `created_at` from `items`. Never `SELECT *` from `items`. If anything token-shaped (`access-...`) ever appears in output, do not repeat it.
- **Never write to the database directly.** The only permitted write is the budgets API (below). Everything else is read-only.
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

## Conventions (sign/unit gotchas)

- All money is **integer cents**. Divide by 100 for display.
- Transaction `amount` uses the Plaid sign convention: **positive = money out** (spend), negative = money in (income, refunds).
- "Spend" **excludes** `category LIKE 'TRANSFER%'` and `category = 'INCOME'` (moving money between own accounts isn't spend) but **includes** rows with `category IS NULL`.
- `credit` and `loan` account balances are **positive amounts owed** — negate them when computing net worth.
- `transactions.date` is ISO text `yyyy-mm-dd`; slice months with `date LIKE 'YYYY-MM-%'`. Timestamps elsewhere are milliseconds since epoch.
- `pending = 1` transactions may still change or disappear; exclude them when reconciling against statements.
- Balance snapshots are per sync run; bucket by day taking the latest per account per day (the queries file does this).

## Analysis methodology

**Always run the freshness check first** (query 1). If the latest transaction or snapshot is more than ~3 days old, say so and caveat every conclusion with "data last synced <date>".

| Question | Query | Interpretation notes |
|---|---|---|
| Where did the money go this month? | 2 — spending by category | Compare against the 3-month average (query 3 per category); flag categories >20% above it. |
| Is spending trending up or down? | 3 — monthly trend | One month is noise; call it a trend only with ≥3 months of movement. Current month is partial. |
| What subscriptions/recurring charges exist? | 7 — recurring approximation | A grouping heuristic, not truth: verify cadence via `avg_gap_days` (~7 weekly, ~30 monthly, ~365 yearly) and amount stability before calling something a subscription. The app's exact heuristic is `lib/recurring.ts`. |
| Am I over budget? | 6 — budget vs actual | ≥80% mid-month deserves a heads-up; >100% is over. Refunds (negative amounts) reduce spend. |
| What am I worth right now? | 4 — net worth now | Matches the dashboard headline. Null balances are excluded. |
| How has net worth changed? | 5 — net worth over time | No carry-forward: a day where one account lacks a snapshot shows a false dip — check account coverage before explaining a dip. |
| Find specific transactions | 8 — search | Case-insensitive LIKE over name and merchant. |

## Advice guidelines

- **Ground every claim in a query you just ran** and quote the actual numbers. Never estimate from memory or extrapolate beyond the data.
- **Stay in scope:** budgeting, spending patterns, subscription cleanup, and cash-flow observations — yes. **No specific investment, securities, tax, or legal advice**; offer general principles at most and recommend a professional for those.
- Categories are Plaid's automatic labels and can be wrong — sanity-check surprising numbers by listing the underlying transactions before drawing conclusions.
- Recommendations are suggestions. **Only write a budget after the user explicitly agrees**, and only via `POST /api/budgets`.
- This data is private and stays local. Never send raw transaction dumps to third-party services, and don't surface account masks or numbers unless the user asks.

## Installing this skill

**Hermes or any Claude-compatible agent:** symlink the skill directory so `git pull` keeps it current (copy if your agent doesn't follow symlinks):

```
ln -s /path/to/Delta/skills/delta-finance ~/.claude/skills/delta-finance
```

**Any other agent:** this file and `references/` are plain markdown — put SKILL.md in the agent's context and let it read the reference files on demand.

**Environment:** set `DATABASE_PATH` to the absolute path of `delta.db` (defaults to `./delta.db`) and `DELTA_URL` to the app's URL (defaults to `http://localhost:3000`).
