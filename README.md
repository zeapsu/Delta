# Delta

A self-hosted personal finance dashboard. Delta links your bank, card and brokerage accounts through Plaid, syncs them every few hours into a local SQLite database, and shows spending, budgets, recurring charges, investments and net worth. Your own agent (Claude or any MCP client) can read and work with the data through Delta's MCP server.

**Run your own:** see [docs/self-hosting.md](docs/self-hosting.md) for Plaid keys, Tailscale, Docker, backups and connecting an agent. Delta has no login: the private network plus per-agent API tokens is the security model.

## Connect an agent (MCP)

Delta serves an MCP server at `/api/v1/mcp` (Streamable HTTP). Connecting an agent takes two steps on the Delta host:

1. `npm run token -- create <agent-name>` (in Docker: `docker compose exec delta npm run token -- create <agent-name>`) (add `--scope write` if the agent may set budgets and recurring rules). It prints the token plus ready-to-paste MCP configs (Claude Code command, JSON for most clients, and an `mcp-remote` stdio bridge for clients that only run local servers), pointed at `DELTA_URL` from `.env`.
2. Paste one of them into the agent.

The tools carry Delta's finance conventions in their descriptions, return dollars, and attach an `as_of` block with stale-data warnings, so no skill install is needed. The agent's machine must be on the tailnet.

## Agent skills

Finance analysis skills for LLM agents live in [`skills/delta-finance/`](skills/delta-finance/SKILL.md) — see its SKILL.md for querying conventions and install instructions.

## Development

```bash
npm ci
npm run dev    # http://localhost:3000, sandbox Plaid
npm test       # pure-logic self-checks
npm run lint
```

Put `PLAID_CLIENT_ID` and `PLAID_SANDBOX_SECRET` in `.env` (see `.env.example`). Contributor conventions live in [AGENTS.md](AGENTS.md).
