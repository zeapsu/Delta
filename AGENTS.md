# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This file is `AGENTS.md`; `CLAUDE.md` is a symlink to it. After MVP, this file will be reworked to instruct agents on using the finance skills and how to provide advice/recommendations to the user.

## Project: Delta — Personal Finance Webapp

A personal finance webapp that connects to financial institutions via **Plaid** and serves the data through a dashboard. Two deliverables live in this repo:

1. **The webapp** — Plaid link flow, data sync, dashboard, and a chat UI element for talking with the agent.
2. **Agent skills** — provider-agnostic skill files with instructions for performing personal-finance analysis and guidelines for offering advice/recommendations. These must not assume any specific LLM provider.

## Current State

Greenfield. **The stack is TBD** — it will be decided in the first official working session. Do not scaffold or pick a framework before that decision is made with the user. Once decided, record the stack, build/test/lint commands, and architecture here.

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
