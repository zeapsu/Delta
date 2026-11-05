---
slug: /
title: Introduction
---

# Delta

Delta is a self-hosted personal finance dashboard. It links your bank, card and brokerage accounts through [Plaid](https://plaid.com), syncs them every few hours into a SQLite database on your own machine, and shows where your money goes:

- **Overview**: net worth, this month's spending so far, cash flow and the health of each bank connection.
- **Spending**: spend per category for any month, with pending charges called out.
- **Transactions**: search and filter everything, and relabel a category for one transaction or for every transaction from a merchant.
- **Budgets**: monthly budgets per category with progress.
- **Recurring**: subscriptions and bills. Delta suggests series it detects and you confirm or dismiss them.
- **Investments** and **Net worth**: brokerage activity and balance history.
- **Settings**: how closely your agent watches your spending (Relaxed, Balanced or Watchful, or your own thresholds).

## Your agent, your data

Delta has no chatbot of its own. Instead it serves an [MCP](https://modelcontextprotocol.io) server, so the agent you already use (Claude, or any MCP client) can answer questions about your money with the same numbers the dashboard shows. Every card in the dashboard has an **Ask** button that copies what it shows as a prompt you can paste into that agent.

Agents get a per-agent token. Read tokens can only look; write tokens can also set budgets, confirm recurring charges and relabel categories. See [Connect an agent](agents.md).

A hosted agent passes what it reads to its provider. A local model keeps it in your network.

## How it's built

- One Next.js app (TypeScript, App Router) with a SQLite database through Drizzle and better-sqlite3.
- Plaid calls only happen on the server. Plaid access tokens never leave the database.
- No login. The private network you run it on (Tailscale is recommended) is the boundary, and the agent API also needs a token. Read the [security model](self-hosting.md#security-model-read-this-first) before you run it.

## Where to go next

- [Home server app](home-server.md): Portainer, CasaOS, Dockge, Synology, Unraid or TrueNAS.
- [Self-hosting](self-hosting.md): Docker, Plaid keys, terminal install, phone access, backups.
- [Homebrew](homebrew.md): a Mac or Linux with Homebrew, no Docker.
- [Connect an agent](agents.md): create a token and paste the MCP config.
- [MCP tools](mcp-tools.md) and [REST API](api.md): what agents can do.
- [Architecture](architecture.md) and the [contributing guide](https://github.com/zeapsu/Delta/blob/main/CONTRIBUTING.md): for working on Delta itself.
