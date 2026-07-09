# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This file is `AGENTS.md`; `CLAUDE.md` is a symlink to it. After MVP, this file will be reworked to instruct agents on using the finance skills and how to provide advice/recommendations to the user.

## Project: Delta — Personal Finance Webapp

A personal finance webapp that connects to financial institutions via **Plaid** and serves the data through a dashboard. Two deliverables live in this repo:

1. **The webapp** — Plaid link flow, data sync, dashboard, and a chat UI element for talking with the agent.
2. **Agent skills** — provider-agnostic skill files with instructions for performing personal-finance analysis and guidelines for offering advice/recommendations. These must not assume any specific LLM provider.

## Stack & Architecture

Decided 2026-07-08 (session 1). Roadmap lives in GitHub milestones/issues on `zeapsu/Delta`.

- **Stack:** Next.js (App Router, TypeScript) + Tailwind, SQLite via Drizzle (better-sqlite3). Single codebase; Plaid calls happen in API routes only.
- **Deployment:** headless Jetson (ARM Linux), 24/7, served over Tailscale to tailnet devices only. **No auth** — the tailnet is the trust boundary.
- **Chat/agent:** the app makes no LLM API calls. The chat UI is a thin bridge that drives the user's **Hermes** agent non-interactively on the Jetson. The finance skills are also installable into Hermes directly so it can query Delta from its own interfaces.
- **Agent hardening:** Hermes gets least-privilege access — read-only DB access by default (Plaid tokens never exposed), writes only through validated app API routes, automated SQLite backups.
- Build/test/lint commands: record here once the app is scaffolded (M1).

## Environment

`.env` (gitignored, already present) contains:
- `PLAID_CLIENT_ID`
- `PLAID_PRODUCTION_SECRET`
- `PLAID_SANDBOX_SECRET`

Use the **sandbox** secret for all development; production credentials only with explicit user sign-off. Never log or commit Plaid secrets or access tokens.

## Priorities

- **Velocity and cost-efficiency first.** MVP = a functioning product. UI/UX is secondary but must be functional and reasonably polished.
- Prefer the simplest working solution; avoid speculative abstractions and premature infrastructure.

## Development Workflow

Default to an **orchestrator pattern**: the main session plans and coordinates, delegating implementation tasks to subagents with explicit model choices — cheaper/faster models (e.g. Haiku/Sonnet) for mechanical or well-specified work, stronger models only where the task demands it.

**Session start:**
1. `git log --oneline -20` and `gh pr list` — see where the last session left off and confirm it closed cleanly. If an orphaned branch/PR exists, resume or finish it before starting new work.
2. `gh issue list --milestone "<next open milestone>"` — the current milestone's open issues are the session's scope.
3. Create the milestone branch (e.g. `m2-plaid-integration`) and open a draft PR early so progress is visible from the first commit.
4. Plan the session against those issues before delegating implementation, per the orchestrator pattern.

**Cadence: one milestone per session, one PR per milestone.** Work each session on a branch for the current milestone. Commit frequently with descriptive messages — rich git history is how context is preserved across sessions. At the end of the session, run the **close skill**, which commits remaining work, merges the PR, and ends the session.
