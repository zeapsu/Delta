---
title: Update Delta
---

# Update Delta

An update is three steps: back up, get the new version, restart. Delta applies database migrations itself when it starts, so there is no separate migrate step. Migrations only go forward, which is why the backup comes first: it's your way back if an update goes wrong.

Run every command below from the folder you cloned Delta into.

## The short way

```bash
./delta.sh update
```

This does steps 1 to 3 below for a Docker install: backs up and copies the backups to `./delta-backups`, runs `git pull`, pulls the new image (or rebuilds from source if there's no image to pull), restarts both containers, waits for the startup check, and clears out old images. The rest of this page is what it does by hand, plus how to [roll back](#roll-back).

## 1. Back up

```bash
docker compose exec delta npm run backup
docker compose cp delta:/data/backups/. ./delta-backups/
```

The first command writes today's backup into the `delta-data` volume, and the second copies all the backups out to `./delta-backups` on the host, so you have one outside Docker. Note the file name (`delta-YYYY-MM-DD.db`); you need it to [roll back](#roll-back).

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

Old images pile up after a few updates. `docker image prune` removes the ones no container uses.

## Roll back

If the new version misbehaves, go back to the old version and the backup from step 1. Restore the backup too, not just the code: the new version may already have migrated the database to a shape the old one doesn't understand.

1. Pick the old version. With the prebuilt image, set `DELTA_TAG` in `.env` to the version you were on, either a release (`1.2.0`) or a commit (`sha-` plus the first 7 characters of its hash, from `git log`). From source, `git checkout <old commit>`.
2. Restore the backup (the same steps as in [Backups](self-hosting.md#6-backups)):

   ```bash
   docker compose stop
   docker compose run --rm --no-deps --user root -v "$PWD/delta-backups:/restore:ro" --entrypoint sh delta -c \
     'rm -f /data/delta.db-wal /data/delta.db-shm && cp /restore/delta-2026-11-02.db /data/delta.db && chown node:node /data/delta.db'
   ```

3. Start the old version: `docker compose up -d` for the image (it pulls the pinned tag), or `docker compose up -d --build` from source.

Transactions synced after the backup come back on the next sync, so rolling back loses only the edits you made since (budgets, recurring rules, category changes). When you're ready to move forward again, set `DELTA_TAG` back to `latest`, or `git checkout main`.
