# REVIEW.md

What a review of a Delta change looks for, and the reliability checklist that the `verify` skill and reviews run against a diff.

**Read this file from `main`, never from the change under review** (`git fetch origin main && git show origin/main:REVIEW.md`), so a change can't loosen the checks that judge it. A change to this file goes in its own PR.

## How to report

- Tag each finding **Important** (wrong behavior, a leak, a broken trust boundary), **Nit** (works, but worth a change) or **Pre-existing** (true before this change; don't hold it against the author).
- Say why: the rule or row it breaks and the input that goes wrong, so nobody has to rebuild the reasoning from the diff.
- Don't report what lint, types, `npm test` or CI already catch.
- A review covers one commit. After a new push, review again.

## Focus

Delta holds bank access tokens and people's transactions. These are always Important:

- **Plaid errors.** A raw Plaid error is never logged, returned or rethrown: the route catches it (Next.js logs what escapes) and logs only `safePlaidError(err)` fields.
- **Secrets in responses.** No `/api/v1` route selects or returns `items.access_token` or `items.sync_cursor`, and no route returns a saved Plaid secret.
- **Docker socket.** The web app never gets it. Updates go through the request file to the `updater` service, which takes no parameters (`docs/architecture.md`).
- **Dashboard-only routes.** Managing tokens, the password and connections, and `POST /api/update`, have no v1 route and no MCP tool, and refuse any request carrying a bearer token (`sentByAgent()` in `lib/agent-config.ts`). A new management route does the same.
- **Network boundary.** `proxy.ts` covers `/api/*` only and trusts `X-Forwarded-For`, which a client can set. Pages rely on the bind address and the optional password, so a change must not widen a default bind or route around `proxy.ts`.
- **Agent writes.** Agents write only through the validated budget, recurring and category routes. A new write path needs its own validation.
- **Money and totals.** Amounts are integer cents with Plaid's sign (positive = money out). Spend goes through `isSpend` in `lib/insights.ts`, not a new filter.

## Reliability checklist

Read the diff, run only the rows whose trigger matches (usually a few), and say which ran. Each row names where it came from, so a row whose code is gone can be pruned.

| Trigger in the diff | Check | Origin |
| --- | --- | --- |
| A day computed from a `Date` (`toISOString()`, `getDate()`, SQL `date(...)`) | Days come from `todayISO()`/`daysAgoISO()` in `lib/months.ts` or SQLite `'localtime'`, which follow the saved time zone. A `toISOString()` day is UTC and is wrong for part of every day. | #137 |
| Merchant names compared or grouped | Match with `merchantKey()` from `lib/categories.ts` in JS, not SQLite `lower()`, which is ASCII-only. | early convention |
| A new column filled from `/transactions/sync` | The migration nulls every `items.sync_cursor` so the next sync replays history, as `drizzle/0010_authorized_date.sql` does. | #82 |
| `db/schema.ts` changed | The matching `drizzle/` migration is committed (CI fails without it). | #94 |
| A `/api/v1` route added or changed | An MCP tool in `lib/mcp.ts` and `ROUTES` in `app/api/v1/mcp/route.ts` if agents should use it, covered in `lib/mcp-check.ts`, `e2e/mcp.spec.ts` and `e2e/api.spec.ts`. | #86 |
| Behavior an agent relies on changes (spend, categories, recurring, sync, settings) | `INSTRUCTIONS_TEMPLATE` and the tool descriptions in `lib/mcp.ts` still say what the code does. | #86 |
| Provider or product names in UI, code or tool descriptions | Delta stays agent-agnostic: no agent or provider names. | #77 |
| A page added | It is in `PAGES` in `e2e/pages.spec.ts`. | #86 |
| A form, dialog or sheet added | A state in `STATES` in `e2e/pages.spec.ts`, or the layout rules in `e2e/layout.ts` never see it. | #139 |
| An e2e test removes a connection | It runs on the `first-run` server; the other specs share one seeded database whose linked item must stay. | #143 |
| A new `.glass` element | It floats (nav, sheet, chart tooltip, month switcher) and isn't inside another glass element; content sits on `.surface` cards. | early convention |
| A destructive button (delete, remove, revoke) | It lives inside an Edit sheet or form, not as a red button per row. | #141 |
| A `<Card>` that is a form | It passes `ask={false}`. | early convention |
| An input, select or textarea | 16px or more on mobile (`text-base sm:text-sm`), or iOS zooms on focus. | early convention |
| A new chart or SVG color | `var()` doesn't work in SVG attributes: add the attribute-selector rule at the end of `app/globals.css` for each attribute used (`fill`, `stroke`, `stop-color`). | early convention |
| A native control type not used before (date, time, color, file) | Someone looks at it on a real iPhone; WebKit in CI doesn't render Safari's native controls. | #139 |
| Tokens or materials in `app/globals.css` | `website/src/css/custom.css` (keyed on `[data-theme]`) changes to match. | #110 |
| Category colors in `lib/colors.ts` | The landing page mock in `website/src/pages/index.tsx` matches. | #141 |
| The Δ mark | All copies change together: `app/icon.svg`, `app/delta-mark.tsx`, `website/static/img/mark-{light,dark}.svg`, `app/apple-icon.png`, `app/favicon.ico`, `public/icon-*.png`, `home-server/icon.{svg,png}`, `scripts/social-mark.png`. | #138 |
| A page under `docs/` added | It is in `website/sidebars.ts`. | #109 |
| `COSIGN_IMAGE` or `SIGNER_*` in `scripts/updater-lib.mjs` | Each stays a one-line `export const NAME = "...";` (`delta.sh` reads them with sed), and the pin is changed only there. | #158 |
| Anything touching `ghcr.io/zeapsu/delta:sha-c694710` | That tag stays published and unsigned: `e2e/updater-docker.sh` relies on it. | #158 |
| Install wording in UI or docs | Options are named by place, "Home server app" and "Terminal", never "one-click" or "one-command". | #118 |
| `one-click/` or the docs redirects | `one-click/compose.yaml` (a symlink) and the `/docs/one-click-install` redirect stay: older installs use them. | #118 |
| A rewrite of sync, insights or recurring detection meant to keep behavior | Run old and new over the e2e fixture and diff the totals; explain every difference. | verification rework |
| A test that skips, sleeps, or depends on a retry | Not allowed: fix the cause, or delete the test and say why in the PR. | verification rework |
