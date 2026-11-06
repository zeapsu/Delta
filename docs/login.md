---
title: Password
---

# Password

Delta can ask for a password before showing any page. It's off by default, and your private network stays the main boundary: the password is a second lock for devices on that network you don't fully trust.

## Turn it on

**Settings → Password**, enter a password (8 characters or more), **Turn on**. The same card changes it, turns it off, and logs this device out.

- Each browser stays logged in for 30 days.
- Changing the password logs out every other device.
- 10 wrong tries from one address lock it out for 15 minutes.

## What it covers

| | Needs |
|---|---|
| Every page, and the dashboard's own `/api/*` routes | the password (a session cookie) |
| Agents: `/api/v1` and the MCP server | their [token](agents.md), as before |
| The sync timer (`POST /api/plaid/sync` and `/api/plaid/refresh`) | nothing more; it only starts a Plaid pull |

Agents can't change the password, even with a write token.

## Forgot it

Turn it off from the machine Delta runs on, then set a new one in Settings:

| Install | Run |
|---|---|
| Terminal (`delta.sh`) | `./delta.sh reset-password` |
| Home server app | open a console on the `delta` container in your panel, then `npm run password -- reset` |
| From source | `npm run password -- reset` |
