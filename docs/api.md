---
title: REST API
---

# REST API

`/api/v1` is the token-authenticated API for agents and scripts. The [MCP tools](mcp-tools.md) are a thin layer over it. `GET /api/v1` describes every endpoint, so an agent can discover it on its own.

## Authentication

Every request needs `Authorization: Bearer dlt_...` (see [Connect an agent](agents.md#1-create-a-token)) and must come from loopback or an allowed network (`DELTA_ALLOWED_NETWORKS`). The one exception is `/api/v1/mcp` with `DELTA_PUBLIC_MCP=1`, which answers any network but still needs the token ([agents that call from the internet](agents.md#agents-that-call-from-the-internet)).

- `GET` and `HEAD` need a **read** or **write** token.
- `POST`, `PUT` and `DELETE` need a **write** token.

Errors: `400` for a bad parameter (the message says which), `401` for a missing, invalid or revoked token, `403` when the token lacks the scope or the caller is outside the allowed networks.

```bash
curl -s -H "Authorization: Bearer $DELTA_API_TOKEN" "$DELTA_URL/api/v1/spending?month=2026-10"
```

## Conventions

- Money is **integer cents**. Transaction amounts use the Plaid sign: positive = money out, negative = money in.
- Dates are `YYYY-MM-DD`, months `YYYY-MM`. JSON keys are camelCase.
- Credit and loan balances are positive amounts owed; net worth subtracts them.
- Spend excludes transfers, income, loan disbursements and credit card payments, and includes uncategorized rows and other loan payments.

## Read endpoints

| Endpoint | Parameters | Returns |
| --- | --- | --- |
| `GET /api/v1/status` | | Data freshness and per-connection sync health |
| `GET /api/v1/accounts` | | Accounts with current balances |
| `GET /api/v1/transactions` | `from`, `to`, `month`, `account_id`, `category`, `q`, `pending`, `limit` (1-500, default 100), `offset` | Transactions, newest first by posted date, paged |
| `GET /api/v1/cash-flow` | `months` (1-36, default 6), `end` | Posted income vs spend per month |
| `GET /api/v1/spending` | `month` (default this month), `date_basis` (`posted` or `authorized`) | Spend per category |
| `GET /api/v1/budgets` | `month` | Budgets with progress |
| `GET /api/v1/recurring` | | Confirmed recurring charges and unreviewed suggestions |
| `GET /api/v1/investments` | `account_id`, `from`, `to`, `limit`, `offset` | Investment activity |
| `GET /api/v1/net-worth` | `from` | Net worth now and daily history |
| `GET /api/v1/settings` | | Your analysis thresholds (`customized: false` means the defaults), edited on `/settings` |

## Sync

`POST /api/v1/sync` works with a read token. It asks the banks to re-check for new transactions and syncs now, at most once every 5 minutes. With `{"if_stale": true}` it syncs only when the data is more than 15 minutes old. It waits up to 30 seconds (10 with `if_stale`), then answers `status`: `synced` (with `result`: counts and failed connections), `running`, `throttled`, `fresh` or `no_connections`. `next_sync_at` is when Delta syncs again on its own to pick up the re-checked transactions.

## Write endpoints

| Endpoint | Body | Does |
| --- | --- | --- |
| `POST /api/v1/budgets` | `{"category", "monthlyAmount"}` | Create or update a budget (cents) |
| `DELETE /api/v1/budgets` | `{"category"}` | Remove a budget |
| `POST /api/v1/recurring` | `{"status", "name", "amount", "gapDays", "anchorDate", "matchKey"?}` | Confirm or dismiss a recurring charge |
| `PUT /api/v1/recurring` | `{"id", "name", "amount", "gapDays", "anchorDate"}` | Edit a confirmed rule |
| `DELETE /api/v1/recurring` | `{"id"}` | Remove a rule |
| `POST /api/v1/transactions/category` | `{"id", "category", "merchant"?}` | Relabel a transaction (`category: null` undoes it; `merchant: true` applies to every transaction from that merchant) |

## MCP

`POST /api/v1/mcp` is the MCP endpoint. It only needs a read token to connect; write tools still need a write token.
