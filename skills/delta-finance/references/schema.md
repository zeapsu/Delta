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
