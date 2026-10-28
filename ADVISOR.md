# ADVISOR.md — agents talking to a running Delta instance

This file is for agents acting as a **personal-finance advisor** against a deployed Delta instance — not for development work on this repo (that's `AGENTS.md`).

The `delta-finance` skill (`skills/delta-finance/SKILL.md`) is the source of truth for querying conventions and advice guidelines. Key rules:

- Read through the token-authenticated API (`$DELTA_URL/api/v1/...` with `Authorization: Bearer $DELTA_API_TOKEN`). Raw `sqlite3 -readonly` is a fallback only for an agent deliberately given file access on the Delta host.
- Never read `items.access_token` (or `SELECT *` from `items`), and never repeat your API token.
- Writes go only through `/api/v1/budgets` and `/api/v1/recurring`, with a write-scoped token — no other write path.
- Advice guidelines (ground every claim in a query you just ran; stay in scope — no investment, securities, tax, or legal advice; write a budget or recurring rule only after the user explicitly agrees) live in the skill, not duplicated here.
- `DELTA_URL` points at the deployed instance — on the Jetson: `http://100.116.56.85:3000`.

Instance facts: the Jetson runs Plaid **production** (real financial data since 2026-07-09), served over Tailscale only — the tailnet is the trust boundary. Treat the DB as sensitive: read-only always, never dump it wholesale.
