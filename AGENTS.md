# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This file is `AGENTS.md`; `CLAUDE.md` is a symlink to it. Finance analysis skills for agents live in `skills/delta-finance/` — see its `SKILL.md` for querying conventions, advice guidelines, and install into Hermes or any agent.

## Project: Delta — Personal Finance Webapp

A personal finance webapp that connects to financial institutions via **Plaid** and serves the data through a dashboard. Two deliverables live in this repo:

1. **The webapp** — Plaid link flow, data sync, dashboard, and a chat UI element for talking with the agent.
2. **Agent skills** — provider-agnostic skill files with instructions for performing personal-finance analysis and guidelines for offering advice/recommendations. These must not assume any specific LLM provider.

## Agent advisor mode

This file is the **development** doc. Agents acting as a personal-finance advisor against a running Delta instance read `ADVISOR.md` instead (which points to `skills/delta-finance/SKILL.md` as the source of truth).

## Stack & Architecture

Decided 2026-07-08 (session 1). Roadmap lives in GitHub milestones/issues on `zeapsu/Delta`.

- **Stack:** Next.js (App Router, TypeScript) + Tailwind, SQLite via Drizzle (better-sqlite3). Single codebase; Plaid calls happen in API routes only.
- **Deployment:** headless Jetson (ARM Linux), 24/7, served over Tailscale to tailnet devices only. **No auth** — the tailnet is the trust boundary.
- **Chat/agent:** the app makes no LLM API calls. The chat UI is a thin bridge that drives the user's **Hermes** agent non-interactively on the Jetson. The finance skills are also installable into Hermes directly so it can query Delta from its own interfaces.
- **Agent hardening:** Hermes gets least-privilege access — read-only DB access by default (Plaid tokens never exposed), writes only through validated app API routes, automated SQLite backups.
- Build/test/lint commands: `npm run dev` (dev server), `npm run build` (production build), `npm run lint` (ESLint). DB smoke test: `npx tsx db/check.ts`.
- **DB conventions (M1):** money as integer cents (Plaid sign convention: positive = money out), timestamps as `timestamp_ms`, snake_case SQL columns / camelCase TS keys. Schema in `db/schema.ts`; after editing it run `npx drizzle-kit generate` and commit the `drizzle/` output — migrations auto-apply when `db/index.ts` is first imported (no separate migrate step on the Jetson). DB path: `DATABASE_PATH` env, default `./delta.db`.

- **Plaid conventions (M2):** client singleton in `lib/plaid.ts` (`server-only`, environment switched via `PLAID_ENV` — see Production Plaid gate); sync engine in `lib/sync.ts`. Gotcha: `/transactions/sync` returns `accounts: []` when nothing changed, so balance snapshots come from `accountsBalanceGet` (which also returns non-transaction accounts — loans/IRA etc.). No in-app scheduler by decision: the `delta-sync` systemd timer (see M6) `POST`s `/api/plaid/sync` every 6h instead.
- **Headless Plaid E2E test:** bypass the Link browser flow with `POST https://sandbox.plaid.com/sandbox/public_token/create` (`institution_id: ins_109508`, `initial_products: ["transactions"]`), then POST the token to `/api/plaid/exchange`. In-browser sandbox creds: `user_good` / `pass_good`. First sync after linking may return 0 added for ~a minute — retry.

- **Dashboard conventions (M3):** pages are async server components (`force-dynamic`) querying Drizzle directly; shared money/category formatting in `lib/format.ts`; charts are hand-rolled (div bars, inline SVG line) — no chart library. Net worth negates `credit`/`loan` account balances (stored as positive amounts owed); snapshots are bucketed by day (timestamps are per-item, not per-run). Spending/recurring views exclude `TRANSFER%` and `INCOME` categories — moving money between own accounts isn't spend. Recurring detection is a pure heuristic in `lib/recurring.ts` (self-check: `npx tsx lib/recurring-check.ts`); upgrade path is Plaid's recurring-transactions product. Budgets writes go through `/api/budgets` only (validated — it's the agent trust boundary). Responsive convention (M8): mobile-first — base Tailwind classes target ~375px, `sm:` restores the desktop look; tables get an `overflow-x-auto` wrapper rather than stacked layouts.

- **Skill conventions (M4):** `skills/delta-finance/` is provider-agnostic markdown (SKILL.md + `references/`); canonical SQL lives in `references/queries.md`; agents read the DB via `sqlite3 -readonly` (never `items.access_token`) and write only through `/api/budgets`. Verify docs + SQL with `bash scripts/skill-check.sh`.

- **Chat bridge conventions (M5, updated M9):** `/api/chat` spawns the Hermes CLI (`HERMES_CMD` env, default `hermes`) with `-z <message> --skills delta-finance --continue delta-chat-<conversationId>`, streams stdout as `text/plain`, serializes turns (one global queue — deliberate: one hermes at a time even across conversations), 120s timeout; errors arrive as a trailing `[...]` line in the stream, not an error status. Local dev without Hermes: `HERMES_CMD=./scripts/hermes-stub.sh npm run dev`. Requests are refused unless first-hop is loopback or tailnet (100.64/10) — the tailnet remains the real trust boundary. DB backups: `npm run backup` (better-sqlite3 online backup → `backups/`, keeps 7).

- **Deployment conventions (M6):** systemd units live in `deploy/` — `delta.service` (the app), `delta-backup` (daily backup timer), `delta-sync` (6h Plaid sync timer) — installed via `sudo deploy/install.sh` on the Jetson. App runs as `zeapsu`, `next start -H <tailscale-ip>` (100.116.56.85) — binding to the tailscale interface is what closes the `x-forwarded-for` spoofing ceiling noted in `app/api/chat/route.ts`. `WorkingDirectory` is the repo root because `./delta.db` and `./drizzle` defaults are cwd-relative. Node comes from nvm, so units use absolute paths. The Jetson `.env` additionally sets `DATABASE_PATH` (absolute) and `DELTA_URL` (tailscale IP — localhost is unreachable once bound to the tailscale interface, and spawned Hermes inherits this env). No separate unix user for the bridge — decided against (Hermes login lives in `zeapsu`'s home; the tailnet is the trust boundary).
- **Production cutover conventions (M7):** the Jetson runs Plaid **production** since 2026-07-09 — real financial data. Local development stays sandbox (`PLAID_ENV` defaults to `sandbox`; the local `delta.db` is sandbox data). The pre-cutover sandbox DB is preserved on the Jetson as `delta-sandbox-fixture.db` next to the live DB. Off-device backups: the user's Mac pulls the Jetson's `backups/` daily via launchd (`deploy/mac/install.sh`; rsync-over-ssh into `~/Backups/delta/`, 60-day retention). The backup script flips each copy to non-WAL journal mode — `sqlite3 -readonly` cannot open a WAL db without its `-shm` file. Sync-health gotchas (issue #34): journald on the Jetson is volatile with ~minutes of retention — an empty `journalctl -u delta-sync.service` does NOT mean the timer didn't fire; check the DB (`transactions` count / `MAX(date)`) instead. Investment/brokerage items legitimately show 0 rows in `transactions` and no cursor — `/transactions/sync` doesn't cover investment activity; it now syncs separately via date-window `/investments/transactions/get` into `investment_transactions` (issue #37 done). Items lacking investments consent log-skip and may need a re-link. Deploying code to the Jetson requires `git pull` + `npm run build` + `sudo systemctl restart delta.service` — a pull alone leaves the old build serving.
- **Conversations & charts conventions (M9):** chat is multi-conversation — `conversations`/`messages` tables, transcripts persisted server-side in the `/api/chat` stream wrapper (user turn inserted before spawn; assistant turn — including any trailing error line — written exactly once via the insert-guard in finish/cancel), Hermes session key derived as `delta-chat-<id>`, conversations created lazily on first send and managed via `/api/conversations` (budgets-route validation style; messages cascade-delete via FK). Charts use **recharts** (first UI dep — post-MVP, UI deps are acceptable on merit) as `"use client"` islands in `app/charts.tsx` with fixed-height wrappers (ResponsiveContainer is client-only); the home sparkline stays hand-rolled server SVG. Palette = chart CSS vars in `app/globals.css` (light/dark via `prefers-color-scheme`, CVD-validated). Gotcha: `var()` is invalid inside SVG fill/stroke *presentation attributes* (renders black, no error) — recharts sets colors as attributes, so `globals.css` carries attribute-selector rules (`[fill="var(--chart-1)"] { fill: var(--chart-1); }`) that re-assert them as CSS; keep that block in sync when adding chart vars.
- **Production Plaid gate (satisfied for the Jetson, still applies to any new instance):** `lib/plaid.ts` selects environment via `PLAID_ENV` (`sandbox` default / `production`). Flipping an instance to production requires ALL of: explicit user sign-off, Plaid production access approval, `PLAID_ENV=production` + `PLAID_PRODUCTION_SECRET` in that instance's `.env`, a fresh DB (sandbox data doesn't mix), and linking real institutions through the Link flow from a tailnet browser.

## Environment

`.env` (gitignored, already present) contains:
- `PLAID_CLIENT_ID`
- `PLAID_PRODUCTION_SECRET`
- `PLAID_SANDBOX_SECRET`
- `PLAID_ENV` (default `sandbox`; see Production Plaid gate above)

Use the **sandbox** secret for all development (the Jetson production instance is the only place `PLAID_ENV=production` belongs). Never log or commit Plaid secrets or access tokens.

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
