---
title: Update Delta
---

# Update Delta

An update is three steps: back up, get the new version, restart. Delta applies database migrations itself when it starts, so there is no separate migrate step. Migrations only go forward, which is why the backup comes first: it's your way back if an update goes wrong.

Run every command below from the folder you cloned Delta into. Installed Delta from an app panel such as Portainer or CasaOS? Follow [Update](one-click-install.md#update) in the one-click guide instead.

You don't have to watch for releases: when a newer version is out, a small **Update** pill appears in Delta's header. Clicking it copies `./delta.sh update` for you to run on the host. (Delta can't update itself: that would need control of Docker, which is root on the host, from an app with no login.) To find out, Delta asks GitHub's API twice a day how far its build is behind `main`; it sends nothing but that question. Turn it off with `DELTA_UPDATE_CHECK=off` in `.env`. Images you build yourself only know their version when built through `delta.sh`, or with `DELTA_COMMIT=$(git rev-parse HEAD)` set for `docker compose build`.

## The short way

```bash
./delta.sh update
```

This does steps 1 to 3 below for a Docker install: backs up, copies the backups to `./delta-backups` readable only by you, and keeps a copy named `delta-YYYY-MM-DD-pre-update-HHMMSS.db`. It then runs `git pull`, pulls the new image (or shows why it couldn't and rebuilds from source), restarts both containers, waits for the startup check, and removes the image it replaced unless another tag still points to it. To roll back from a script update, restore the `pre-update` file: Delta overwrites that day's `delta-YYYY-MM-DD.db` when it restarts. The rest of this page is what it does by hand, plus how to [roll back](#roll-back).

## 1. Back up

```bash
docker compose exec delta npm run backup
docker compose cp delta:/data/backups/. ./delta-backups/
```

The first command writes today's backup into the `delta-data` volume, and the second copies all the backups out to `./delta-backups` on the host, so you have one outside Docker. Delta overwrites today's backup when it restarts, so give this one its own name, such as `cp delta-backups/delta-YYYY-MM-DD.db delta-backups/delta-YYYY-MM-DD-pre-update.db`, and use that copy to [roll back](#roll-back). The backups hold your Plaid access tokens, so keep the folder private (`chmod 700 delta-backups`).

## 2. Get the new version

Pick the way you installed.

### Prebuilt image

```bash
git pull                 # new compose files and .env.example
docker compose pull      # new image from ghcr.io/zeapsu/delta
docker compose up -d     # recreates both containers on the new image
```

`latest` follows the main branch. To stay on a release instead, set `DELTA_TAG` in `.env` to its version (for example `DELTA_TAG=1.2.0`), and change it when you want to move up.

### Built from source

```bash
git pull
docker compose up -d --build
```

### Without Docker

```bash
npm run backup           # instead of step 1
git pull
npm ci
npm run build
```

Then restart however you run it, for example `sudo systemctl restart delta.service`. Pulling alone isn't enough: the running server keeps serving the old build until it restarts.

## 3. Check it

```bash
docker compose logs delta   # look for "[delta] Plaid ...: keys OK"
```

Open Delta and check the overview loads with your accounts. If `git pull` changed `.env.example`, compare it with your `.env` (`git diff HEAD@{1} -- .env.example`) for new settings. They all have defaults, so you only need to act if you want to change one.

Old images can pile up after a few updates. `docker image prune` removes the untagged ones no container uses, across every project on this machine, so check `docker image ls` first if you run other things here.

## Roll back

If the new version misbehaves, go back to the old version and the backup from step 1. Restore the backup too, not just the code: the new version may already have migrated the database to a shape the old one doesn't understand.

1. Pick the old version. With the prebuilt image, set `DELTA_TAG` in `.env` to the version you were on, either a release (`1.2.0`) or a commit (`sha-` plus the first 7 characters of its hash, from `git log`). From source, `git checkout <old commit>`.
2. Restore the backup (the same steps as in [Backups](self-hosting.md#6-backups)):

   ```bash
   docker compose stop
   docker compose run --rm --no-deps --user root -v "$PWD/delta-backups:/restore:ro" --entrypoint sh delta -c \
     'rm -f /data/delta.db-wal /data/delta.db-shm && cp /restore/delta-2026-11-02-pre-update-193000.db /data/delta.db && chown node:node /data/delta.db'
   ```

3. Start the old version: `docker compose up -d` for the image (it pulls the pinned tag), or `docker compose up -d --build` from source.

Transactions synced after the backup come back on the next sync, so rolling back loses only the edits you made since (budgets, recurring rules, category changes). When you're ready to move forward again, set `DELTA_TAG` back to `latest`, or `git checkout main`.
