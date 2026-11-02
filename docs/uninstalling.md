---
title: Uninstall Delta
---

# Uninstall Delta

Do the steps in order. Disconnecting your banks needs Delta still running, and the rest deletes things you can't get back. Installed Delta from an app panel such as Portainer or CasaOS? See [Uninstall](one-click-install.md#uninstall) in the one-click guide.

## The short way

```bash
./delta.sh uninstall
```

It asks you to type `uninstall`, then does steps 1, 3 and 4 below for a Docker install: disconnects every bank at Plaid, copies a final backup to `delta-backups/` next to your Delta folder, and runs `docker compose down -v --rmi all`. It then lists what's left for you: removing Delta from your agents, deleting the folder, and your Plaid keys. The steps below are the same thing by hand.

To do it by hand, run every command below from the folder you cloned Delta into. Without Docker, drop the `docker compose exec delta` prefix and run the `npm` commands in that folder directly.

## 1. Disconnect your banks at Plaid

Deleting Delta's database doesn't tell Plaid anything: each bank you linked stays connected to your Plaid account. On a paid Plaid plan, products like Transactions are billed monthly for every connected bank until it is removed, and on the free Trial plan they keep counting toward its limit of 10. So remove them first:

```bash
docker compose exec delta npm run unlink            # lists your linked banks
docker compose exec delta npm run unlink -- --yes   # removes them at Plaid
```

This calls Plaid's `/item/remove` for every bank. Delta can't sync them anymore afterwards, but your history stays in the database until you delete it in step 4. If one fails (for example a bank you already removed), the command says which and exits with an error; the others are still removed.

On production, you can also check from the bank side at [my.plaid.com](https://my.plaid.com), where you can see and disconnect the apps your bank logins are shared with.

## 2. Disconnect your agents

Remove the Delta MCP server (or API token) from each agent you connected, so they stop calling a server that's gone. If you're only removing Delta's access but keeping the instance, revoke the tokens instead:

```bash
docker compose exec delta npm run token -- list
docker compose exec delta npm run token -- revoke <id>
```

Tokens live in the database, so deleting it in step 4 revokes them all.

## 3. Keep a copy (optional)

If you want your history, take a last backup and copy it off the volume:

```bash
docker compose exec delta npm run backup
docker compose cp delta:/data/backups/. ./delta-backups/
```

Each backup is a plain SQLite file. Move `delta-backups/` out of the Delta folder before step 5, and keep it somewhere private: it still contains the Plaid access tokens, although they stop working once step 1 has removed the banks.

## 4. Remove the containers and data

```bash
docker compose down -v --rmi all
```

This stops and removes both containers, deletes the `delta-data` volume (the database and the backups inside it), and removes the Delta image. To remove the containers but keep the data for later, leave out `-v`.

Without Docker, stop and disable whatever runs Delta and its sync and backup schedules (for the systemd units in `deploy/`, `sudo deploy/uninstall.sh`). The data is `delta.db` and the `backups/` folder next to it, inside the Delta folder unless you set `DATABASE_PATH`.

## 5. Delete the folder

```bash
cd ..
rm -rf delta
```

The folder holds `.env` with your Plaid keys, and without Docker it also holds the database. If you're done with Plaid altogether, also rotate or delete the keys in the [Plaid Dashboard](https://dashboard.plaid.com/developers/keys). If you copied backups to another machine, delete those too.

Anything else you set up for Delta, such as the `After=tailscaled.service` lines from [Boot order with Tailscale](self-hosting.md#boot-order-with-tailscale), is harmless to leave but you can remove it with `sudo systemctl revert docker.service`.
