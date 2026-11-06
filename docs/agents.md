---
title: Connect an agent
---

# Connect an agent

Delta serves an MCP server at `/api/v1/mcp` (Streamable HTTP, stateless, JSON responses). Any MCP client can use it: Claude Code, Claude Desktop, Cursor, or an agent framework of your own. Connecting one takes two steps.

## 1. Create a token

In Delta, open **Settings → Agents**:

1. Name the agent.
2. Pick **Read**, or **Read + edit** if it may also set budgets, confirm or edit recurring charges, and relabel categories.
3. Click **Create token**.

Delta shows the token once, inside ready-to-paste configs pointed at `DELTA_URL`:

- **Claude Code:** a `claude mcp add` command.
- **JSON config:** an `mcpServers` block for most clients (Cursor and others).
- **stdio only:** an `mcp-remote` bridge for clients that only run local servers.

Only a hash of the token is stored, so if you lose it, revoke it and create a new one.

From a terminal on the machine that runs Delta, the same thing:

```bash
docker compose exec delta npm run token -- create my-agent                 # Docker
docker compose exec delta npm run token -- create my-agent --scope write   # Read + edit
npm run token -- create my-agent                                           # from source
```

## 2. Paste the config into your agent

The agent's machine must be able to reach `DELTA_URL`: the same computer, or a device on your tailnet. Ask it something like "how much did I spend on food this month?" to check it works.

### Agents that call from the internet

Some hosted agents connect from their provider's servers, not from your devices. To serve one, publish only the MCP path and let it past the network check:

1. Set `DELTA_PUBLIC_MCP=1` (in `.env`, or in your panel's environment settings for a home server app install) and restart Delta. `/api/v1/mcp` then answers from any network; every other route keeps the network check.
2. Publish that one path, for example with Tailscale Funnel: `sudo tailscale funnel --bg --https=8443 --set-path /api/v1/mcp http://<delta-host>:3000/api/v1/mcp`. Don't funnel the whole port: pages have no login.
3. Give the agent a **Read** token and the URL `https://<machine>.<tailnet>.ts.net:8443/api/v1/mcp`.

The token is then the only thing between the internet and your data, so revoke it if it leaks.

## What the agent gets

- **Tools** for status, accounts, transactions, spending, cash flow, budgets, recurring charges, net worth and investments, plus write tools for write tokens. See [MCP tools](mcp-tools.md).
- **Dollars**, not cents, with the Plaid sign convention (positive = money out).
- **An `as_of` block** on every answer, with warnings when data is more than 3 days old or a bank connection's last sync failed.
- **Instructions** that carry Delta's conventions (what counts as spend, pending charges, confirmed vs suggested recurring charges) and advice guidelines, plus your analysis settings from the **Settings** page (how big a category jump counts as a spike, how many months make a trend, when to warn about a budget): ground every claim in fetched numbers, no investment, tax or legal advice, and only write after you explicitly agree.

A hosted agent sends what it reads to its model provider. For fully private analysis, use an MCP client backed by a local model.

You don't need to install a skill or give the agent database access.

## Managing tokens

**Settings → Agents** lists active tokens with their access and when each was last used; **Revoke…** removes one. From a terminal:

```bash
npm run token -- list          # id, prefix, scope, name, last used, revoked or active
npm run token -- revoke <id>
```

(Prefix with `docker compose exec delta` in Docker.) Revoking takes effect on the next request.

## The Ask button

Every card in the dashboard has an **Ask** button, and every page header has **Ask Agent**. They copy what's on screen, plus the page, URL and time, as a prompt you can paste into your agent. Delta is served over plain http on your private network, where browsers block the modern clipboard API, so the button falls back to the older copy command.

## Without MCP

The same token works on the REST API: `curl -H "Authorization: Bearer dlt_..." $DELTA_URL/api/v1` lists every endpoint. See [REST API](api.md).
