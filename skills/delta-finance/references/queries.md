# Canonical queries

Run each with `sqlite3 -readonly "file:${DATABASE_PATH:-./delta.db}?mode=ro" "<sql>"`.
Placeholders: replace `:month` with a quoted `'YYYY-MM'` and `:q` with a quoted `'%term%'` before running. Money columns are formatted to dollars via `/ 100.0`.

## 1. Data freshness — always run first

```sql
-- expects: one row; warn the user if any value is > ~3 days old (last_investment may legitimately be null/older — not all accounts hold investments)
SELECT (SELECT MAX(date) FROM transactions) AS last_transaction,
       (SELECT date(MAX(snapshot_at) / 1000, 'unixepoch') FROM balance_snapshots) AS last_snapshot,
       (SELECT MAX(date) FROM investment_transactions) AS last_investment;
```

## 2. Spending by category for a month

```sql
-- expects: one row per category, biggest spend first; refunds within a category net out
SELECT COALESCE(category, 'UNCATEGORIZED') AS category,
       printf('%.2f', SUM(amount) / 100.0) AS spent_usd
FROM transactions
WHERE date LIKE :month || '-%'
  AND amount > 0
  AND pending = 0
  AND (category IS NULL OR (category NOT LIKE 'TRANSFER%' AND category != 'INCOME'))
  AND (category_detailed IS NULL OR category_detailed != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')
GROUP BY 1
HAVING SUM(amount) > 0
ORDER BY SUM(amount) DESC;
```

## 3. Monthly spend trend (last 6 months)

```sql
-- expects: one row per month, newest first; the newest month is usually partial
SELECT substr(date, 1, 7) AS month,
       printf('%.2f', SUM(amount) / 100.0) AS spent_usd
FROM transactions
WHERE amount > 0
  AND (category IS NULL OR (category NOT LIKE 'TRANSFER%' AND category != 'INCOME'))
  AND (category_detailed IS NULL OR category_detailed != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')
GROUP BY 1
ORDER BY 1 DESC
LIMIT 6;
```

## 4. Net worth now

```sql
-- expects: one number matching the dashboard headline; credit/loan balances count negative
SELECT printf('%.2f', SUM(CASE WHEN type IN ('credit', 'loan') THEN -current_balance
                               ELSE current_balance END) / 100.0) AS net_worth_usd
FROM accounts
WHERE current_balance IS NOT NULL;
```

## 5. Net worth over time

```sql
-- expects: one row per day with any snapshot; days missing an account's snapshot dip (no carry-forward)
SELECT day, printf('%.2f', SUM(adj) / 100.0) AS net_worth_usd FROM (
  SELECT bs.account_id,
         date(bs.snapshot_at / 1000, 'unixepoch') AS day,
         CASE WHEN a.type IN ('credit', 'loan') THEN -bs.current_balance
              ELSE bs.current_balance END AS adj,
         ROW_NUMBER() OVER (PARTITION BY bs.account_id, date(bs.snapshot_at / 1000, 'unixepoch')
                            ORDER BY bs.snapshot_at DESC) AS rn
  FROM balance_snapshots bs JOIN accounts a ON a.id = bs.account_id
) WHERE rn = 1 GROUP BY day ORDER BY day;
```

## 6. Budget vs actual for a month

```sql
-- expects: one row per budget; pct >= 100 is over budget
SELECT b.category,
       printf('%.2f', b.monthly_amount / 100.0) AS budget_usd,
       printf('%.2f', MAX(COALESCE(s.spent, 0), 0) / 100.0) AS spent_usd,
       ROUND(100.0 * MAX(COALESCE(s.spent, 0), 0) / b.monthly_amount) AS pct
FROM budgets b
LEFT JOIN (
  -- no amount > 0 filter: refunds must net against charges (the app clamps the net at zero)
  SELECT category, SUM(amount) AS spent
  FROM transactions
  WHERE date LIKE :month || '-%'
  GROUP BY category
) s ON s.category = b.category
ORDER BY pct DESC;
```

## 7. Recurring charges

User-confirmed recurring series are the truth — read them first:

```sql
-- expects: confirmed recurring series (user-reviewed); monthly cost = amount * 30 / gap_days
SELECT name,
       printf('%.2f', amount / 100.0) AS amount_usd,
       gap_days,
       anchor_date,
       printf('%.2f', amount * 30.0 / gap_days / 100.0) AS monthly_usd
FROM recurring_rules
WHERE status = 'confirmed'
ORDER BY amount DESC;
```

`status = 'dismissed'` rows are suggestions the user rejected — never count them. To *propose* a new recurring entry, suggest it to the user and (on agreement) `POST /api/recurring`.

The heuristic below only surfaces unreviewed **candidates** — useful for "anything recurring the user hasn't confirmed yet?", not for totals:

```sql
-- expects: candidate subscriptions; verify avg_gap_days (~7 weekly, ~30 monthly, ~365 yearly)
-- and amount stability before calling one a subscription. Exact heuristic: lib/recurring.ts.
SELECT LOWER(COALESCE(merchant_name, name)) AS merchant,
       COUNT(*) AS occurrences,
       printf('%.2f', AVG(amount) / 100.0) AS avg_usd,
       MIN(date) AS first_seen,
       MAX(date) AS last_seen,
       ROUND((julianday(MAX(date)) - julianday(MIN(date))) / (COUNT(*) - 1), 1) AS avg_gap_days
FROM transactions
WHERE amount > 0 AND pending = 0
  AND (category IS NULL OR (category NOT LIKE 'TRANSFER%' AND category != 'INCOME'))
  AND (category_detailed IS NULL OR category_detailed != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')
GROUP BY 1
HAVING COUNT(*) >= 3
ORDER BY occurrences DESC;
```

Caveat: this groups by exact merchant string, so `Uber 072515` and `Uber 060322` split into different groups when `merchant_name` is null, and it lumps all of a merchant's charges together. The app's detector (`lib/recurring.ts`) is smarter: it drops whole name tokens containing digits (bank payments embed a unique reference code per txn — rent), clusters each merchant's txns by amount (~10% band) so multiple subscriptions from one merchant (Apple $9.99 + $19.99) separate from one-off purchases, then requires a median gap of at least 5 days, gaps within ±max(3 days, 30%) of the median, and recency within 2× the cadence. Either way these are only suggestions — the user confirms or dismisses each on the app's /recurring page, and only `recurring_rules` rows count.

## 8. Investment activity

```sql
-- expects: newest 50 buys/sells/fees; investment activity, never spend — keep out of spending analysis
SELECT date, name, type, subtype, ticker_symbol, quantity,
       printf('%.2f', amount / 100.0) AS amount_usd
FROM investment_transactions
ORDER BY date DESC
LIMIT 50;
```

## 9. Transaction search

```sql
-- expects: newest 50 matches; LIKE is case-insensitive for ASCII
SELECT t.date, t.name, t.merchant_name, t.category,
       printf('%.2f', t.amount / 100.0) AS amount_usd,
       t.pending, a.name AS account
FROM transactions t JOIN accounts a ON a.id = t.account_id
WHERE t.name LIKE :q OR t.merchant_name LIKE :q
ORDER BY t.date DESC
LIMIT 50;
```
