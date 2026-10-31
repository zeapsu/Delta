# Delta

A self-hosted personal finance dashboard your own agent can talk to.

Delta links your bank, card and brokerage accounts through [Plaid](https://plaid.com), syncs them every few hours into a SQLite database on your own machine, and shows spending, budgets, recurring charges, investments and net worth. It has no chatbot of its own: it serves an [MCP](https://modelcontextprotocol.io) server, so the agent you already use (Claude, or any MCP client) can answer questions about your money with the same numbers the dashboard shows.

**Docs:** [zeapsu.github.io/Delta](https://zeapsu.github.io/Delta/)

## Features

- **Overview** with net worth, month-to-date spending, cash flow and the health of each bank connection
- **Spending** by category, with pending charges called out
- **Transactions** search, plus category relabels for one transaction or a whole merchant
- **Budgets** per category with progress
- **Recurring** charges: Delta suggests subscriptions it detects, you confirm or dismiss them
- **Investments** activity and **net worth** history
- **MCP server and REST API** with per-agent read or write tokens
- **Ask** buttons on every card that copy what it shows as a prompt for your agent
- Runs on anything with Docker, including a Raspberry Pi or other arm64 board

## Security model

Delta is single-user and **has no login**. The private network you run it on is the boundary ([Tailscale](https://tailscale.com) is recommended), API routes only answer loopback and allowed networks, and agents need a revocable token. Plaid access tokens never leave the database. Never expose Delta to the public internet. Details in the [self-hosting guide](docs/self-hosting.md#security-model-read-this-first).

## Quick start

You need Docker and Plaid API keys. Plaid's free Trial plan covers personal use (up to 10 bank logins); see [Set up Plaid's free Trial plan](docs/plaid-trial.md).

```bash
git clone https://github.com/zeapsu/Delta.git delta
cd delta
cp .env.example .env      # add PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET, set DELTA_BIND and DELTA_URL
docker compose up -d --build
```

Open `DELTA_URL`, click **Connect account**, and in sandbox sign in to any bank with `user_good` / `pass_good`. The [self-hosting guide](docs/self-hosting.md) covers Tailscale, production Plaid access, backups and updates.

## Connect an agent

```bash
docker compose exec delta npm run token -- create my-agent   # add --scope write to allow budget/recurring/category edits
```

It prints a token and ready-to-paste MCP configs for Claude Code, JSON-configured clients (Claude Desktop, Cursor, ...) and stdio-only clients. Paste one into your agent. See [Connect an agent](docs/agents.md) and the [MCP tools](docs/mcp-tools.md).

## Development

```bash
npm ci
cp .env.example .env   # sandbox keys
npm run dev            # http://localhost:3000
npm test               # pure-logic self-checks
npm run lint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup and conventions, and [docs/architecture.md](docs/architecture.md) for how it fits together. The doc site lives in `website/` (Docusaurus) and builds from `docs/`.

## License

See [LICENSE.md](LICENSE.md).
