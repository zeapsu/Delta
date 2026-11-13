# AGENTS.md

> This file is `AGENTS.md`; `CLAUDE.md` is a symlink to it. Notes about your own machines or instance go in `CLAUDE.local.md`, which is gitignored.

Before changing code, read `CONTRIBUTING.md` (setup, checks, core conventions) and `docs/architecture.md`. This file adds only what those two and the code comments do not say.

## Secrets and trust boundaries

- Never log, return or rethrow a raw Plaid/Axios error: `err.config.data` is the request body with `client_id`, `secret` and `access_token`. Catch it in the route (Next.js logs what escapes) and log only `safePlaidError(err)` fields.
- Never select or return `items.access_token` or `items.sync_cursor` in an `/api/v1` route, and never return a saved Plaid secret from any route.
- Never switch an instance to `PLAID_ENV=production` without the user's explicit sign-off. Production needs a fresh database: sandbox and production data must not mix.
- Managing tokens, the password and connections is dashboard only by design: no v1 route, no MCP tool, and those routes refuse any request that carries a bearer token (`sentByAgent()` in `lib/agent-config.ts`). Do the same in a new management route.
- The network check covers `/api/*` only and trusts `X-Forwarded-For`, which a client can set. Pages rely on the bind address (and the optional password), so do not widen a default bind.
- API calls answered 403 under Docker are usually source-address rewriting, not a guard bug: a port published on 127.0.0.1 arrives from the bridge gateway (172.17.0.1), Docker Desktop always rewrites the source, and Linux with Tailscale can NAT tailnet clients. Read "Linux with Tailscale" and "Docker Desktop on macOS" in `docs/self-hosting.md` before touching `lib/tailnet.ts`.

## Data and dates

- Every date helper runs in the process's local time, which is the user's saved time zone (`applyTimeZone()` sets `process.env.TZ`, and SQLite `'localtime'` follows it). Use `todayISO()`/`daysAgoISO()` from `lib/months.ts`, and never mix in `toISOString()` days, which are UTC.
- Match merchants with `merchantKey()` from `lib/categories.ts` in JS. SQLite `lower()` is ASCII-only.
- To backfill a new column from `/transactions/sync`, null every `items.sync_cursor` in the migration so the next sync replays the full history, as `drizzle/0010_authorized_date.sql` does.
- `INSTRUCTIONS_TEMPLATE` and the tool descriptions in `lib/mcp.ts` are the source of truth for what connected agents are told about Delta's conventions. Keep them in step with the code.
- The MCP server is hand-rolled with no SDK. `@modelcontextprotocol/sdk` is a dev dependency for the e2e client only, so nothing under `app/` or `lib/` may import it.

## UI

- Two layers: content sits on `.surface` cards, and only floating chrome (nav, sheets, chart tooltips, the month switcher) uses `.glass`. Never put glass on glass.
- Destructive actions go inside an Edit sheet or form, not a red button per row.
- A card that is a form opts out of the Ask button: `<Card ask={false}>`.
- Delta is usually served over plain http, where `navigator.clipboard` is unavailable. Copy through `copy()` in `app/ask-agent.tsx`, which falls back to `execCommand("copy")`.
- The SVG attribute-selector rules at the end of `app/globals.css` are per attribute: a color used as `stroke` or as a gradient `stop-color` needs its own rule, not only the `fill` one.
- WebKit in CI is not iOS: Safari's native controls (the date field, for one) only render that way on a device, so a new native control type needs a look on a real iPhone.

## When you add or change something

- A page: add it to `PAGES` in `e2e/pages.spec.ts`.
- A form, dialog or sheet: add a state to `STATES` in the same file, or the layout rules in `e2e/layout.ts` never see it.
- A v1 route: add a case to `e2e/api.spec.ts`, on top of the MCP steps in `CONTRIBUTING.md`.
- A doc page: add it to `website/sidebars.ts`.
- An e2e test that removes a connection: run it on the `first-run` server. The other specs share one seeded database, and its linked item must stay.
- Design tokens or materials in `app/globals.css`: `website/src/css/custom.css` is a hand copy keyed on `[data-theme]`. Change both.
- Category colors pinned in `lib/colors.ts`: the landing page mock in `website/src/pages/index.tsx` mirrors them by hand.
- The Δ mark: it exists as `app/icon.svg`, inline paths in `app/delta-mark.tsx`, `website/static/img/mark-{light,dark}.svg` and rasters (`app/apple-icon.png`, `app/favicon.ico`, `public/icon-*.png`, `home-server/icon.{svg,png}`, `scripts/social-mark.png`). Change them together.

## Tooling, releases and wording

- `typescript` is aliased to `@typescript/typescript6` on purpose: typescript-eslint and Next's build type check need a compiler API, which TS 7 does not ship. TS 7 is `@typescript/native`, and `npx tsc` runs it.
- Undo that split (plain `typescript@^7`) once typescript-eslint supports TS 7.1+ (typescript-eslint#10940).
- Cut a release by running the `release` workflow, not by pushing a tag. Its "Set version" PR lands after the tag, so the tagged commit still carries the previous version. No image assets on releases.
- Name install options by where you install: "Home server app", "Terminal". Never "one-click" or "one-command".
- Keep `one-click/compose.yaml` (a symlink) and the `/docs/one-click-install` redirect: installs made before the rename still use those paths.
