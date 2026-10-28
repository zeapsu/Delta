# Delta database schema

SQLite at `${DATABASE_PATH:-./delta.db}`. Source of truth: `db/schema.ts`. All money columns are **integer cents**; all `*_at` columns are **milliseconds since epoch**.

## items — one per linked institution

| column | type | notes |
|---|---|---|
| id | integer PK | |
| plaid_item_id | text unique | |
| access_token | text | **FORBIDDEN — Plaid API secret. Never select this column, never `SELECT *` from this table.** |
| institution_name | text nullable | |
| sync_cursor | text nullable | null = never synced |
| last_error_code | text nullable | Plaid error from the latest sync; null = OK. `ITEM_LOGIN_REQUIRED` & co. mean the user must Reconnect in the app |
| last_synced_at | integer ms nullable | last successful sync of this connection |
| created_at | integer ms | |

## accounts

| column | type | notes |
|---|---|---|
| id | integer PK | |
| item_id | integer FK → items.id | |
| plaid_account_id | text unique | |
| name | text | |
| official_name | text nullable | |
| type | text | `depository`, `credit`, `loan`, `investment`, ... For `credit`/`loan` the balance is a positive amount **owed** — negate for net worth. |
| subtype | text nullable | e.g. `checking`, `savings`, `credit card` |
| mask | text nullable | last digits — don't surface unless asked |
| current_balance | integer cents, nullable | |
| available_balance | integer cents, nullable | |
| currency | text, default `USD` | |
| created_at | integer ms | |

## transactions

| column | type | notes |
|---|---|---|
| id | integer PK | |
| account_id | integer FK → accounts.id | |
| plaid_transaction_id | text unique | |
| amount | integer cents | Plaid sign: **positive = money out**, negative = money in |
| date | text `yyyy-mm-dd` | slice months with `date LIKE 'YYYY-MM-%'` |
| name | text | raw descriptor, e.g. `Uber 072515 SF**POOL**` |
| merchant_name | text nullable | cleaner, prefer `COALESCE(merchant_name, name)` |
| category | text nullable | Plaid primary category, e.g. `FOOD_AND_DRINK`, `TRANSFER_IN`, `INCOME` |
| pending | integer 0/1 | pending rows may change or disappear |
| created_at | integer ms | |

Index: `(account_id, date)`.

## investment_transactions — buys/sells/fees within investment accounts

| column | type | notes |
|---|---|---|
| id | integer PK | |
| account_id | integer FK → accounts.id | |
| plaid_investment_transaction_id | text unique | |
| date | text `yyyy-mm-dd` | |
| name | text | |
| type | text | Plaid enum: `buy`, `sell`, `cash`, `fee`, `transfer` |
| subtype | text | |
| security_name | text nullable | |
| ticker_symbol | text nullable | denormalized for convenience |
| quantity | **REAL**, nullable | fractional shares — **not cents** |
| price | **REAL**, nullable | per-share price in dollars, sub-cent precision — **not cents** |
| amount | integer cents | Plaid sign: **positive = money out** |
| fees | integer cents, nullable | |
| currency | text, default `USD` | |
| created_at | integer ms | |

Index: `(account_id, date)`. **Buys/sells here are investment activity, not spend — never include this table in spending analysis** (queries 2, 3, 7 in `queries.md` already scope to `transactions` only, which excludes it).

## balance_snapshots — one row per account per sync run

| column | type | notes |
|---|---|---|
| id | integer PK | |
| account_id | integer FK → accounts.id | |
| current_balance | integer cents | |
| snapshot_at | integer ms | several per day possible — bucket by day, latest per account wins |

## budgets

| column | type | notes |
|---|---|---|
| id | integer PK | |
| category | text unique | matches `^[A-Z_]{1,64}$` |
| monthly_amount | integer cents | |
| created_at | integer ms | |

Writes to this table go through `POST/DELETE /api/budgets` only.

## recurring_rules — user-reviewed recurring series

| column | type | notes |
|---|---|---|
| id | integer PK | |
| status | text | `confirmed` (counts as recurring) or `dismissed` (rejected suggestion) |
| match_key | text nullable | detector group key pairing a rule with re-detected series; null for manual entries |
| name | text | display name, user-editable |
| amount | integer cents | |
| gap_days | integer | days between charges (30 ≈ monthly, 365 ≈ yearly) |
| anchor_date | text | ISO `yyyy-mm-dd`, last known/expected charge — next expected = anchor + gap_days rolled past today |
| created_at | integer ms | |
| updated_at | integer ms | |

The app's detection heuristic only *suggests*; these rows are the truth. Writes go through `POST/PUT/DELETE /api/recurring` only.

## api_tokens — per-client API tokens

Managed by `npm run token`; only a sha256 of each token is stored. Agents have no reason to read this table.

| column | type | notes |
|---|---|---|
| id | integer PK | |
| name | text | client label, e.g. `felix` |
| token_hash | text | sha256 hex of the token |
| prefix | text | first 8 chars, for listings |
| scope | text | `read` or `write` |
| last_used_at | integer (ms) | touched at most once a minute |
| revoked_at | integer (ms) | non-null = revoked |
| created_at | integer (ms) | |
