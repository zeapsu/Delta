---
title: Homebrew
---

# Install with Homebrew

For a Mac (or Linux) that already has [Homebrew](https://brew.sh). There's no Docker here: Delta runs as a normal background service, and only this computer can reach it.

| You need | Account | When |
| --- | --- | --- |
| [Homebrew](https://brew.sh) | None | Now |
| [Plaid keys](plaid-trial.md) | Plaid (free) | In the browser, after install |
| [Tailscale](#use-it-on-your-phone) | Tailscale (free) | Only to use Delta from your phone |

## Install

```bash
brew install zeapsu/tap/delta
brew services start delta
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (or run `delta open`), then follow the cards: your name, your Plaid keys, then **Connect account**. Delta keeps running in the background and starts again after a restart.

The install builds Delta on your computer, so the first one takes a few minutes.

## Use it on your phone

1. Install [Tailscale](https://tailscale.com/download) on this computer and your phone, and sign in on both with the same account.
2. Run `delta phone`.

Delta then listens only on this computer's Tailscale address, and prints it. Use that address on this computer too. `delta local` goes back to this computer only.

## Connect an agent

**Settings → Agents** creates a token and shows a ready config. From a terminal: `delta token create laptop` (add `--scope write` to let the agent edit budgets and categories). More: [Connect an agent](agents.md).

## Commands

| Command | Does |
| --- | --- |
| `delta open` | Open Delta in the browser |
| `delta phone` / `delta local` | Listen on your Tailscale address / this computer only |
| `delta token create <name>` | New agent token. Also `list`, `revoke <id>` |
| `delta backup` | Back up the database now |
| `delta unlink` | Remove every bank from Plaid |
| `brew services restart delta` | Restart Delta |

## Where things are

Everything is in `$(brew --prefix)/var/delta`:

- `delta.db`: your data, including Plaid access tokens. Keep it private.
- `backups/`: a backup every day, the last 7 kept.
- `delta.env`: settings, such as `PORT=3001` if port 3000 is taken, or Plaid keys if you'd rather not paste them in the browser. Restart after editing.

The log is `$(brew --prefix)/var/log/delta.log`. Delta syncs your banks every 6 hours while the computer is awake.

## Update

When a new release is out, an **Update** pill appears in Delta's header. Clicking it copies:

```bash
delta backup && brew upgrade delta && brew services restart delta
```

## Uninstall

```bash
delta unlink                 # Plaid bills per bank until it's removed
brew services stop delta
brew uninstall delta
rm -r "$(brew --prefix)/var/delta"   # your data and backups; keep it to reinstall later
```

Then remove Delta from your agents' configs: see [Uninstall](uninstalling.md#2-disconnect-your-agents).
