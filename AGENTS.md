# AGENTS.md

> This file is `AGENTS.md`; `CLAUDE.md` is a symlink to it. Notes about your own machines or instance go in `CLAUDE.local.md`, which is gitignored.

Before changing code, read `CONTRIBUTING.md` (setup, checks, core conventions) and `docs/architecture.md`. What a review flags, and the reliability checklist a diff is checked against, are in `REVIEW.md`: read it from `main` (`git show origin/main:REVIEW.md`), not from your branch. This file adds only how to work and what none of those say.

## How to work

- Before every commit, run the `verify` skill (`.claude/skills/verify/`): it boots the app on the mock Plaid, drives what changed and runs the matching checklist rows. End the commit message with a `Verified:` trailer saying what ran (`verify`, `checks` or `none`, with a reason for `none`).
- Before pushing or opening a PR, lint, types, `npm test` and the DB check pass. The hook in `.claude/settings.json` runs them and blocks the push on failure.
- After three rounds of trying to fix the same failing check, stop and ask a human, with what you tried.
- Never skip a flaky test, add a sleep, or lean on a retry. Fix the cause, or delete the test and say why in the PR.
- A mistake seen in two PRs becomes a rule: a lint rule or test if a machine can catch it, otherwise a `REVIEW.md` checklist row with a trigger, a check and the PR it came from. Prefer pruning a stale rule to adding a new one.

## Not visible in a diff

- Never switch an instance to `PLAID_ENV=production` without the user's explicit sign-off. Production needs a fresh database: sandbox and production data must not mix.
- API calls answered 403 under Docker are usually source-address rewriting, not a guard bug: a port published on 127.0.0.1 arrives from the bridge gateway (172.17.0.1), Docker Desktop always rewrites the source, and Linux with Tailscale can NAT tailnet clients. Read "Linux with Tailscale" and "Docker Desktop on macOS" in `docs/self-hosting.md` before touching `lib/tailnet.ts`.
- `typescript` is aliased to `@typescript/typescript6` on purpose: typescript-eslint and Next's build type check need a compiler API, which TS 7 does not ship. TS 7 is `@typescript/native`, and `npx tsc` runs it. Undo the split (plain `typescript@^7`) once typescript-eslint supports TS 7.1+ (typescript-eslint#10940).
- Cut a release by running the `release` workflow, not by pushing a tag. Its "Set version" PR lands after the tag, so the tagged commit still carries the previous version. No image assets on releases.
