---
title: MCP tools
---

# MCP tools

The MCP server at `/api/v1/mcp` exposes these tools. Each one calls the matching [REST endpoint](api.md) in-process, so tools get exactly the API's validation and numbers. Money is returned in **dollars**, and every answer carries an `as_of` block with freshness warnings.

Write tools are only listed for write-scoped tokens, and calls to them with a read token are refused. Their descriptions tell the agent to call them only after you explicitly agree.

## Read tools

| Tool | What it returns |
| --- | --- |
| `get_status` | Data freshness (newest transaction and balance dates) and each bank connection's last sync time and error code. Agents call this first. |
| `list_accounts` | Linked accounts with current and available balances, type and institution. Credit and loan balances are positive amounts owed. |
| `search_transactions` | Transactions, newest first, paged. Filters: `from`, `to`, `month`, `account_id`, `category`, `q` (name substring), `pending`, `limit`, `offset`. Includes the posted `date` and the purchase `authorizedDate`. |
| `spending_by_category` | Spend per category for a `month`, pending included and reported separately. `date_basis=authorized` buckets by purchase date. |
| `cash_flow` | Income vs spending per month (`months`, `end`). |
| `get_budgets` | Budgets with progress for a `month`. |
| `get_recurring` | Confirmed recurring charges (with next expected date and a monthly estimate) and unreviewed suggestions. |
| `get_net_worth` | Current net worth and daily history (`from`). |
| `investment_activity` | Brokerage buys, sells, dividends and fees, paged. Never counted as spend. |

## Write tools

| Tool | What it does |
| --- | --- |
| `set_budget` | Create or change a category's monthly budget. |
| `delete_budget` | Remove a category's budget. |
| `add_recurring_rule` | Confirm or dismiss a recurring charge (answer a suggestion with its `match_key`, or add one by hand). |
| `update_recurring_rule` | Edit a confirmed rule's name, amount, cadence or anchor date. A future anchor date sets the next expected charge. |
| `delete_recurring_rule` | Remove a rule, e.g. after a cancellation. If the charge continues, Delta suggests it again. |
| `set_transaction_category` | Relabel a transaction, or with `all_from_merchant` every transaction from its merchant, now and on future syncs. |
| `reset_transaction_category` | Undo a relabel and go back to the bank's category. |

## Conventions the tools follow

- **Sign:** transaction and investment amounts use Plaid's sign: positive = money out, negative = money in (income, refunds).
- **Spend** excludes transfers between your own accounts (`TRANSFER_IN`/`TRANSFER_OUT`), `INCOME`, `LOAN_DISBURSEMENTS` and credit card payments (the card purchases already count). Other loan payments (student, auto, mortgage) count. Totals from `spending_by_category`, `cash_flow` and `get_budgets` match the dashboard.
- **Pending** charges are included in spend totals and reported separately, because they can still change or disappear.
- **Categories** are Plaid's primary categories (e.g. `FOOD_AND_DRINK`) unless you relabeled them in Delta. Relabels apply everywhere.
- **Recurring:** confirmed rules are the truth; suggestions are guesses and never count in totals.

## Protocol notes

The server is stateless Streamable HTTP with JSON responses: no sessions and no SSE stream, and `GET` answers 405. Send the token as `Authorization: Bearer dlt_...`. It supports `initialize`, `ping`, `tools/list` and `tools/call`.
