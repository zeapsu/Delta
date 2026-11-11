# Contributing to Delta

Thanks for helping. Delta is a small, single-user, self-hosted app, and the bar for a change is: it works, it's simple, and it keeps people's financial data safe.

## Before you start

- **Bugs and small fixes:** open a PR directly.
- **Features or larger changes:** open an issue first so we can agree on the approach. Delta deliberately stays single-user with no login (see [#75](https://github.com/zeapsu/Delta/issues/75) for why hosted multi-user is parked).
- **Security issues:** don't open a public issue. Report it privately through [GitHub security advisories](https://github.com/zeapsu/Delta/security/advisories/new).

## Development setup

You need Node 20.9 or newer and free Plaid **sandbox** keys from [dashboard.plaid.com](https://dashboard.plaid.com/developers/keys). Never develop against production keys or real accounts.

```bash
git clone https://github.com/zeapsu/Delta.git && cd Delta
npm ci
cp .env.example .env     # set PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET
npm run dev              # http://localhost:3000
```

Click **Connect account**, pick any bank, and sign in with `user_good` / `pass_good`. The first sync can return nothing for about a minute; press the sync icon again. The database is `./delta.db` (override with `DATABASE_PATH`), and migrations apply automatically on first use.

To link a sandbox item without the browser, create a public token with Plaid's `/sandbox/public_token/create` (`institution_id: ins_109508`, `initial_products: ["transactions"]`) and POST it to `/api/plaid/exchange`.

To try the agent API locally: `npm run token -- create dev --scope write`, then point an MCP client at `http://localhost:3000/api/v1/mcp`.

## Checks

Run these before you push. CI runs these plus the end-to-end tests, the Docker build and the docs build.

```bash
npm test              # pure-logic self-checks (lib/*-check.ts)
npm run lint
npx tsc --noEmit
npx tsx db/check.ts   # DB smoke test on a throwaway database
```

CI also runs the end-to-end suite, which drives the built app against a mock Plaid server (no keys needed): `npm run build && npx playwright install chromium webkit && npm run e2e`. Run it when you change pages, API routes or MCP tools. It also checks layout (nothing overflowing the screen or its card, down to 320px) in Chromium and in WebKit, the engine behind iOS browsers. If you change `db/schema.ts`, CI fails unless the matching `drizzle/` migration is committed.

If you changed `docs/` or `website/`, run `cd website && npm ci && npm run build` (it fails on broken links).

## Project layout

The [architecture page](docs/architecture.md) has the directory map and how sync, the API and MCP fit together. In short: pages in `app/` are server components that query SQLite directly through Drizzle, shared queries live in `lib/insights.ts`, the Plaid sync engine is `lib/sync.ts`, and the agent API is `app/api/v1/` with the MCP layer in `lib/mcp.ts`.

## Conventions

These are the ones that bite. [`AGENTS.md`](AGENTS.md) has the full list, written for coding agents but useful for anyone.

**Data**
- Money is **integer cents**, with Plaid's sign: positive = money out.
- Schema changes go in `db/schema.ts`; then run `npx drizzle-kit generate` and commit the generated `drizzle/` files with the change.
- `transactions.date` (posted) drives every total. Spend rules live in `isSpend` in `lib/insights.ts`; reuse it rather than writing a new filter.

**Security**
- **Never log a raw Plaid/Axios error.** Its `config.data` holds the client secret and access token. Log only `safePlaidError(err)`.
- Never select `items.access_token` or `sync_cursor` in an `/api/v1` route, and never return them anywhere.
- Writes from agents go only through the validated budget, recurring and category routes. A new write path needs a strong reason and its own validation.
- New `/api/*` routes are covered by `proxy.ts` automatically. Don't bypass it.

**Agent API**
- When you add a `/api/v1` route an agent should use, add an MCP tool for it in `lib/mcp.ts` (and its route to `ROUTES` in `app/api/v1/mcp/route.ts`), and cover it in `lib/mcp-check.ts` and `e2e/mcp.spec.ts`.
- Keep everything agent-agnostic: no provider or product names in the UI, code or tool descriptions.

**UI**
- Mobile first: base Tailwind classes target a ~375px screen, `sm:` restores desktop. Wide tables get an `overflow-x-auto` wrapper.
- Every input, select and textarea renders at 16px or more on mobile (`text-base sm:text-sm`), or iOS zooms on focus.
- Chrome is neutral black/white; color only carries meaning (category, money in/out, status). Use the tokens in `app/globals.css` and the scaffolding in `app/ui.tsx`.
- Charts use recharts in `app/charts.tsx`. Inside SVG presentation attributes `var()` doesn't work, so add a matching attribute-selector rule in `globals.css` for any new chart color.

**Simplicity**
- Prefer the simplest thing that works. No new dependency, abstraction or background service without a clear need.

## Pull requests

- Branch from `main`, keep the PR focused, and describe what changed and how you tested it. Screenshots help for UI changes (sandbox data only, never real accounts).
- Commit messages say what the change does in the imperative ("Add budget alerts", not "added stuff").
- Update the docs in `docs/` when you change behavior a self-hoster or agent would notice, and add a line to `AGENTS.md` when you introduce a convention.

By contributing, you agree that your contributions are licensed under the project's [license](LICENSE.md).
