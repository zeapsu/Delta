---
name: verify
description: Prove a Delta change works before committing it. Runs the fast checks, boots the app on the mock Plaid, drives what the diff touched (pages, API, MCP, sync, updater) and runs the matching REVIEW.md checklist rows. Use before every commit, and whenever asked to verify or smoke-test a change.
---

# Verify a Delta change

Goal: evidence that the change works in the running app, not only that it compiles. Scope every step to the diff. Report what ran, what passed and what you skipped.

## 1. Read the diff and the rules

```bash
git fetch -q origin main
git diff --stat origin/main...HEAD; git diff --stat   # committed + uncommitted
git show origin/main:REVIEW.md                         # main's copy, never the branch's
```

Note which checklist rows in `REVIEW.md` the diff triggers. You run them in step 5.

## 2. Fast checks (about 30 seconds)

```bash
scripts/checks.sh
```

Lint, types, self-checks (also at UTC+14 and UTC-11), the DB smoke test and the migration check: the same as CI's Checks job. Fix failures before going on.

## 3. Build (about 30 seconds)

```bash
npm run build
```

Skip it only when the diff touches nothing under `app/`, `lib/`, `db/`, `drizzle/`, `proxy.ts` or `next.config.ts`.

## 4. Drive what changed

Pick the rows that match the diff. Run each command from the repo root.

| The diff touches | Run |
| --- | --- |
| A page, component or style under `app/` | `npx playwright test e2e/pages.spec.ts --project=desktop --project=phone -g "<path or test name>"`, then look at the screenshots in `e2e/.tmp/results/` (desktop light, phone dark). A new page or sheet must already be in `PAGES`/`STATES`. |
| Layout, spacing, a sheet or a form | Add `-g "nothing overflows"` to the run above. |
| `app/api/v1/`, `lib/mcp.ts`, `lib/api-*.ts`, `proxy.ts`, `lib/tailnet.ts`, `lib/login.ts` | `npx playwright test --project=setup --project=api` |
| Linking, `/setup`, first run, updates (`lib/updater.ts`, `app/update-*`) | `npx playwright test --project=first-run` |
| `lib/sync.ts`, `lib/insights.ts`, `lib/recurring.ts`, `e2e/plaid-mock.mjs` | `npx playwright test --project=setup --project=api --project=desktop -g "spending|transactions|recurring"` and step 4b |
| `scripts/updater*.mjs`, `delta.sh`, `Dockerfile`, compose files | Step 2 covers the updater's pure parts. With Docker available, `docker build -t delta:verify . && bash e2e/updater-docker.sh delta:verify`; otherwise say the image and updater are left to CI's image smoke test. |
| `docs/` or `website/` | `cd website && npm ci && npm run build` (fails on broken links). |
| Only `REVIEW.md`, `AGENTS.md`, `.claude/` or other notes | Nothing to drive. Say so. |

Several areas, or not sure: run the whole suite, `npm run e2e` (about 2 minutes).

### 4b. Try it by hand

For a behavior no test covers yet, start a seeded instance and exercise the change directly:

```bash
node scripts/verify-serve.mjs        # add --dev to skip the build, --demo for seven months of data
```

It prints the URL (`http://127.0.0.1:3300`), a write token and the MCP endpoint, and runs until stopped. Drive it with `curl` (API, MCP `tools/call`), or with Playwright or a browser for pages, at a phone width (375px) as well as desktop. Stop it when done (`pkill -f verify-serve`). If the behavior matters, turn what you did into an e2e test instead of leaving it as a one-off.

## 5. Run the matching checklist rows

For each `REVIEW.md` row the diff triggers, do the check and write one line: the row, and what you saw. Then read the diff once against the Focus list.

## 6. Report

Say what ran and passed, what you skipped and why, and anything you couldn't verify here (an iPhone look, the Docker image, real Plaid). End the commit message with:

```
Verified: verify (<the areas you drove>)
```

Use `Verified: checks` when only step 2 ran, and `Verified: none (<reason>)` when nothing ran.

## Rules

- A failing test is a finding. Don't skip it, add a sleep, or retry until it passes. After three rounds of fixes on the same failure, stop and ask a human.
- Use sandbox data only: the mock Plaid, never real keys or accounts.

## In a sandbox without Playwright's browsers

- If the installed Chromium doesn't match the repo's Playwright version, point at it: `export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (or wherever it lives).
- If WebKit isn't installed, leave out the `iphone` project and the `login` project, which depends on it. List the projects you want, e.g. `--project=setup --project=api --project=first-run --project=desktop --project=phone`, and say WebKit was skipped. CI runs it.
- Leftover servers from an interrupted run hold the ports: `pkill -f next-server; pkill -f plaid-mock`.
