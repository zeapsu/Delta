# Delta

A self-hosted personal finance dashboard your own agent can talk to.

Delta syncs your banks, cards and brokerage through [Plaid](https://plaid.com) into a SQLite file on your own machine, and shows spending, budgets, recurring charges, investments and net worth. No built-in chatbot: its [MCP](https://modelcontextprotocol.io) server gives the agent you already use the same numbers the dashboard shows.

**Docs:** [zeapsu.github.io/Delta](https://zeapsu.github.io/Delta/)

## Features

- **Overview:** net worth, spending so far, cash flow, connection health
- **Spending** by category, pending charges included
- **Transactions:** search, relabel one or a whole merchant
- **Budgets** per category
- **Recurring:** Delta spots subscriptions, you confirm them
- **Investments** and **net worth** history
- **Settings:** how closely your agent watches spending
- **MCP server and REST API** with read or write tokens
- **Ask** on every card copies it as a prompt
- Runs anywhere Docker does, including a Raspberry Pi

## Security model

**No login.** Your private network is the boundary ([Tailscale](https://tailscale.com) recommended). The API only answers allowed networks, agents need a revocable token, and Plaid access tokens never leave the database. Never expose Delta to the internet. [Details](docs/self-hosting.md#security-model-read-this-first).

## Quick start

You need Docker and Plaid keys ([free for personal use](docs/plaid-trial.md)).

**App panel** (Portainer, CasaOS, Dockge, Synology, Unraid): paste [`one-click/compose.yaml`](one-click/compose.yaml), open port 3000, add your Plaid keys in the browser. [Guide](docs/one-click-install.md).

**Terminal:**

```bash
curl -fsSL https://raw.githubusercontent.com/zeapsu/Delta/main/delta.sh | bash -s install
```

It clones into `./delta`, asks for Plaid keys (Enter skips to the browser), writes `.env` with your Tailscale IP and starts Delta. Later: `./delta.sh update` or `./delta.sh uninstall`. By hand:

```bash
git clone https://github.com/zeapsu/Delta.git delta
cd delta
cp .env.example .env      # set DELTA_BIND and DELTA_URL; add Plaid keys here or on the setup page
docker compose up -d --build
```

Open `DELTA_URL` and click **Connect account** (sandbox login: `user_good` / `pass_good`). On Linux with Tailscale, turn on [host networking](docs/self-hosting.md#linux-with-tailscale-use-host-networking) first. More: [self-hosting](docs/self-hosting.md), [update](docs/updating.md), [uninstall](docs/uninstalling.md).

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

Delta is free software under the [GNU Affero General Public License v3.0](LICENSE.md). You can run, change and share it; if you run a modified version as a service for other people, you have to offer them its source.
