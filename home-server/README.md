# Home server listings

Delta for home server app panels and app stores. Users: see [docs/home-server.md](../docs/home-server.md).

| File | For |
| --- | --- |
| [`compose.yaml`](compose.yaml) | Any compose-based panel (Portainer, CasaOS custom install, Dockge, Synology, Unraid Compose Manager, TrueNAS Install via YAML). `one-click/compose.yaml` is a symlink to it for stacks created from the old path. |
| [`umbrel/delta/`](umbrel/delta) | Umbrel App Store package |
| [`casaos/Delta/`](casaos/Delta) | CasaOS / ZimaOS App Store app |
| [`unraid/`](unraid) | Unraid Community Applications template (single container, `DELTA_JOBS=on`) |
| [`icon.svg`](icon.svg), [`icon.png`](icon.png) | Store icon |
| [`pin.sh`](pin.sh) | Sets the release version (and Umbrel's image digest) in the store files |

All store installs use port **3740**, turn off the in-app update notice (the store ships updates) and allow private networks on the API.

## Before submitting

1. Tag a release that includes `scripts/start.mjs` (v1.1.0 or later) and wait for the docker workflow to publish `ghcr.io/zeapsu/delta:<version>`.
2. `home-server/pin.sh <version>`, commit.
3. Install it on a real device of each kind, then open it, add sandbox keys, link `user_good` / `pass_good`, restart, and check the data is still there.

## Umbrel

Rules: [getumbrel/umbrel-apps](https://github.com/getumbrel/umbrel-apps) (`AGENTS.md` and `.agents/skills/`; agent-assisted packaging is welcome).

1. Fork `getumbrel/umbrel-apps`, copy `umbrel/delta/` to the fork's root as `delta/`.
2. `npm run lint:apps -- delta --check-images`.
3. Test on an Umbrel: rsync `delta/` into `/home/umbrel/umbrel/app-stores/getumbrel-umbrel-apps-github-*/delta/` (skip `.gitkeep`), then `sudo umbreld client apps.install.mutate --appId delta`. Open it from the home screen, restart, check data persists.
4. Open the PR, then set `submission:` to its URL. The PR body needs: app/version, upstream URL, image source, testing done, the `/api/v1/*` auth whitelist (token-protected agent API), screenshots and the icon (Umbrel hosts gallery images; don't commit them).

## CasaOS / ZimaOS

Rules: [IceWhaleTech/CasaOS-AppStore](https://github.com/IceWhaleTech/CasaOS-AppStore) `CONTRIBUTING.md` and `docs/` (v2 store).

1. Fork it, copy `casaos/Delta/` to `Apps/Delta/`, add `screenshot-1.png`..`3` from `docs/img/` (overview light, overview dark, spending).
2. `./scripts/build_dist.sh` must pass.
3. Test: CasaOS **App Store → Custom Install → Import** the compose file.
4. PR body: new app, what changed, how you validated it.

## Unraid Community Applications

Rules: [ca.unraid.net/submit](https://ca.unraid.net/submit). Needs a public GitHub repo with the template XML, `ca_profile.xml`, a license and support links.

1. Create a public repo such as `zeapsu/unraid-templates` with `delta.xml` and `ca_profile.xml` from `unraid/` (update `<TemplateURL>` to the new location), plus a LICENSE.
2. Test: Unraid **Docker → Add Container → Template** with the XML in `/boot/config/plugins/dockerMan/templates-user/`.
3. Submit the repo at ca.unraid.net/submit, run the scan, fix findings, submit for review.

## TrueNAS

Users can already install with **Install via YAML** and `compose.yaml`. A catalog listing goes in [truenas/apps](https://github.com/truenas/apps) `ix-dev/community/delta/` (`app.yaml`, `ix_values.yaml`, `questions.yaml`, Jinja compose template, test values). Their PR template asks you to open an issue first and to tick a box if an LLM wrote part of the PR.

## Not listed

- **Runtipi:** the official store takes no new apps. Users can use **Add custom app** with `compose.yaml`.
- **awesome-selfhosted:** first release must be more than 4 months old, and LLM-written submissions are banned. Write that PR by hand.
