---
name: delta-finance
description: Analyze personal finances in the Delta app — spending, trends, recurring charges, budgets, net worth — through Delta's token-authenticated HTTP API (read-only SQLite as a fallback), and offer grounded advice. Use when the user asks about their money, spending, budgets, subscriptions, or net worth.
---

# Delta finance analysis

Delta is a personal finance app that syncs bank data via Plaid into a local SQLite database. This skill teaches you to read that data through Delta's API, run standard analyses, and give advice grounded in the numbers.

## Hard rules (read first)

- **Use the API.** `GET ${DELTA_URL}/api/v1/...` with your token is the primary path. Raw SQL (below) is a fallback for an agent that runs on the Delta host and was given file access on purpose; most agents won't have it.
- **Never expose your API token** in replies, logs, or files you write. If a token leaks, tell the user so they can revoke it.
- **Never read `items.access_token`** (SQL fallback only). Only ever select `id`, `institution_name`, `created_at` from `items`. Never `SELECT *` from `items`. If anything token-shaped (`access-...`, `dlt_...`) ever appears in output, do not repeat it.
- **Writes only through the validated budgets, recurring and category-relabel endpoints** (below), and only with a write-scoped token. Never write to the database directly.
- **Never call `/api/plaid/*` endpoints.** They handle credentials and syncing; they are not for agents.

## Data access (MCP — easiest)

If your agent has Delta's MCP server connected (tools such as `get_status`, `spending_by_category`, `search_transactions`), use those tools: they wrap the API below, return **dollars** instead of cents, and add an `as_of` block with stale-data warnings to every answer. The conventions and advice guidelines in this file still apply. To connect: `npm run token -- create <agent-name>` on the Delta host prints a ready-to-paste MCP config for `${DELTA_URL}/api/v1/mcp`.

## Data access (API — primary)

Base URL `${DELTA_URL:-http://localhost:3000}`. Every request sends `Authorization: Bearer $DELTA_API_TOKEN`. A **read** token can call every GET; a **write** token can also call the budget, recurring and category-relabel writes. The user creates tokens on the Delta host with `npm run token -- create <name> [--scope read|write]` (and `list` / `revoke <id>`).

```
curl -s -H "Authorization: Bearer $DELTA_API_TOKEN" "$DELTA_URL/api/v1/spending?month=2026-10"
```

Responses are JSON, keys camelCase, money in **integer cents**. Errors: 400 bad parameter (message says which), 401 missing/invalid/revoked token, 403 token lacks the scope or the caller is outside the tailnet. `GET /api/v1` lists every endpoint.

| Endpoint | Params | Returns |
|---|---|---|
| `GET /api/v1/status` | — | `lastTransaction`, `lastSnapshot`, `lastInvestment` dates + `connections[]` (`institution`, `lastSyncedAt`, `lastErrorCode` — non-null means that connection's last sync failed) |
| `GET /api/v1/accounts` | — | accounts with `type`, `currentBalance`, `availableBalance`, `institution` |
| `GET /api/v1/transactions` | `from`, `to` (YYYY-MM-DD), `month` (YYYY-MM), `account_id`, `category` (`UNCATEGORIZED` = none), `q` (name/merchant substring), `pending` (`true`/`false`), `limit` (≤500, default 100), `offset` | `transactions[]` newest first by posted `date`, each with `authorizedDate` (purchase date, null if unknown); `total`, `nextOffset` (null on the last page) |
| `GET /api/v1/cash-flow` | `months` (1–36, default 6), `end` (YYYY-MM) | `months[]` oldest first: `income` and `spending` (the app's spend rule, pending included) plus `pendingSpending` (the pending part) |
| `GET /api/v1/spending` | `month` (default this month), `date_basis` (`posted` default = dashboard; `authorized` = by purchase date, posted date when unknown) | `categories[]` biggest first: `total` (pending included) + `pendingTotal` (the pending part); month `total`/`pendingTotal` |
| `GET /api/v1/budgets` | `month` | `budgets[]`: `monthlyAmount`, `net` (refunds netted), `spent` (clamped ≥0), `pct` |
| `GET /api/v1/recurring` | — | `confirmed[]` (user-reviewed truth, with `cadence`, `nextDate`), `suggestions[]` (unreviewed candidates — never count them), `monthlyEstimate` |
| `GET /api/v1/investments` | `account_id`, `from`, `to`, `limit`, `offset` | investment activity, newest first, paged like transactions |
| `GET /api/v1/net-worth` | `from` (YYYY-MM-DD) | `current` (dashboard headline) + `history[]` per day, forward-filled per account (no false dips) |

**Write (budgets)** — needs a write token:

- `POST /api/v1/budgets` with JSON `{"category": "FOOD_AND_DRINK", "monthlyAmount": 50000}` — upserts a monthly budget. `category` must match `^[A-Z_]{1,64}$` (Plaid primary category); `monthlyAmount` is a positive integer in cents, ≤ 100,000,000. Returns `{"ok": true}` or 400.
- `DELETE /api/v1/budgets` with JSON `{"category": "FOOD_AND_DRINK"}` — removes it (404 if absent).

**Write (recurring rules)** — user-confirmed recurring series; the app's heuristic only *suggests*. Needs a write token:

- `POST /api/v1/recurring` with JSON `{"status": "confirmed", "name": "Netflix", "amount": 1549, "gapDays": 30, "anchorDate": "2026-07-08", "matchKey": "netflix"}` — creates a rule. `status` is `"confirmed"` or `"dismissed"` (dismissed suppresses a suggestion); `name` 1–200 chars; `amount` positive integer cents ≤ 100,000,000; `gapDays` integer 1–1000 (days between charges); `anchorDate` ISO `yyyy-mm-dd` (last known/expected charge); `matchKey` optional (the suggestion's group key — omit for manual entries). Returns `{"ok": true}` or 400.
- `PUT /api/v1/recurring` with JSON `{"id": 3, "name": ..., "amount": ..., "gapDays": ..., "anchorDate": ...}` — edits a rule (404 if absent).
- `DELETE /api/v1/recurring` with JSON `{"id": 3}` — removes it (this is how a canceled subscription is recorded).

**Write (category relabels)** — fix a wrong bank category. Needs a write token, and only after the user agrees:

- `POST /api/v1/transactions/category` with JSON `{"id": 42, "category": "FOOD_AND_DRINK", "merchant": false}` — relabels transaction 42 (`id` from `GET /api/v1/transactions`). `category` is a Plaid primary (`BANK_FEES`, `ENTERTAINMENT`, `FOOD_AND_DRINK`, `GENERAL_MERCHANDISE`, `GENERAL_SERVICES`, `GOVERNMENT_AND_NON_PROFIT`, `HOME_IMPROVEMENT`, `INCOME`, `LOAN_DISBURSEMENTS`, `LOAN_PAYMENTS`, `MEDICAL`, `OTHER`, `PERSONAL_CARE`, `RENT_AND_UTILITIES`, `TRANSFER_IN`, `TRANSFER_OUT`, `TRANSPORTATION`, `TRAVEL`). `"merchant": true` relabels every transaction from that merchant (matched on `merchantName`, else `name`), now and on future syncs. `"category": null` undoes it (with `"merchant": true`, removes the merchant rule). Returns `{"ok": true, "updated": n}`; 400/404 on bad input. `GET /api/v1/transactions` shows the bank's original as `plaidCategory`.

## Data access (SQL — fallback)

Only when the API is unreachable **and** you were deliberately given read access to the DB file on the Delta host. Open it read-only (safe while the app is running):

```
sqlite3 -readonly "file:${DATABASE_PATH:-./delta.db}?mode=ro" "<sql>"
```

Table and column reference: [references/schema.md](references/schema.md). Canonical queries: [references/queries.md](references/queries.md) — prefer these over writing SQL from scratch. Writes still go through the API, never SQL.

## Conventions (sign/unit gotchas)

- All money is **integer cents**. Divide by 100 for display.
- Transaction (and investment) `amount` uses the Plaid sign convention: **positive = money out** (spend), negative = money in (income, refunds).
- "Spend" **excludes** `category LIKE 'TRANSFER%'`, `category = 'INCOME'` (moving money between own accounts isn't spend), `category = 'LOAN_DISBURSEMENTS'` (loan money in; some cards file their payment credit here) and `category_detailed = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'` (a card payment settles purchases already counted on the card) but **includes** rows with `category IS NULL` and other `LOAN_PAYMENTS` (student, auto, mortgage).
- `credit` and `loan` account balances are **positive amounts owed** — negate them when computing net worth.
- `transactions.date` is ISO text `yyyy-mm-dd`; slice months with `date LIKE 'YYYY-MM-%'`. Timestamps elsewhere are milliseconds since epoch.
- `pending = 1` transactions are authorized but not yet posted. The app's spend totals (and the queries file) include them because they almost always post; they may still change or disappear (e.g. a refundable hold), so say which charges are pending when they matter, and exclude them when reconciling against statements.
- Balance snapshots are per sync run; bucket by day taking the latest per account per day (the queries file does this).
- Investment buys/sells live in `investment_transactions` (not `transactions`) and are never counted as spend.

## Analysis methodology

**Always run the freshness check first** (`/api/v1/status`, or query 1). If the latest transaction or snapshot is more than ~3 days old, say so and caveat every conclusion with "data last synced <date>".

| Question | API (SQL fallback) | Interpretation notes |
|---|---|---|
| Where did the money go this month? | `/spending` (query 2) | Compare against the prior months (`/spending?month=` for each); flag categories >20% above it. |
| Is spending trending up or down? | `/cash-flow` (query 3) | One month is noise; call it a trend only with ≥3 months of movement. Current month is partial. |
| What subscriptions/recurring charges exist? | `/recurring` (query 7) | `recurring_rules` rows with `status='confirmed'` are user-reviewed truth — use them directly. `suggestions` (and the SQL heuristic in query 7) are only *candidates* the user hasn't reviewed. |
| Am I over budget? | `/budgets` (query 6) | ≥80% mid-month deserves a heads-up; >100% is over. Refunds (negative amounts) reduce spend. |
| What am I worth right now? | `/net-worth` `current` (query 4) | Matches the dashboard headline. Null balances are excluded. |
| How has net worth changed? | `/net-worth` `history` (query 5) | The API history is forward-filled per account like the app's chart. The raw SQL (query 5) is not, so a day where one account lacks a snapshot can show a false dip — check account coverage before explaining a dip found that way. |
| Find specific transactions | `/transactions?q=` (query 9) | Case-insensitive LIKE over name and merchant. |

## Advice guidelines

- **Ground every claim in data you just fetched** and quote the actual numbers. Never estimate from memory or extrapolate beyond the data.
- **Stay in scope:** budgeting, spending patterns, subscription cleanup, and cash-flow observations — yes. **No specific investment, securities, tax, or legal advice**; offer general principles at most and recommend a professional for those.
- Categories are Plaid's automatic labels unless the user relabeled them on the Transactions page (`transactions.category` is already the relabeled value; `plaid_category` keeps Plaid's). Plaid's labels can be wrong — sanity-check surprising numbers by listing the underlying transactions before drawing conclusions.
- Recommendations are suggestions. **Only write a budget or recurring rule after the user explicitly agrees**, and only via `/api/v1/budgets` and `/api/v1/recurring`.
- This data is private and stays local. Never send raw transaction dumps to third-party services, and don't surface account masks or numbers unless the user asks.

## Installing this skill

**Any Claude-compatible agent:** symlink the skill directory so `git pull` keeps it current (copy if your agent doesn't follow symlinks):

```
ln -s /path/to/Delta/skills/delta-finance ~/.claude/skills/delta-finance
```

**Any other agent:** this file and `references/` are plain markdown — put SKILL.md in the agent's context and let it read the reference files on demand.

**Environment:** set `DELTA_URL` to the app's URL (defaults to `http://localhost:3000`; on the deployed Jetson the server binds to the tailscale IP only, so `DELTA_URL` must be `http://<tailscale-ip>:3000` — localhost won't answer) and `DELTA_API_TOKEN` to a token from `npm run token -- create <agent-name>` (read scope unless the agent should set budgets/recurring rules). The agent's host must be on the tailnet. `DATABASE_PATH` (absolute path of `delta.db`) is only needed for the SQL fallback.
