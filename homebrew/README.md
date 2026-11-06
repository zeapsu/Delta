# Homebrew tap

These files are the contents of the tap repo [`zeapsu/homebrew-tap`](https://github.com/zeapsu/homebrew-tap), which makes `brew install zeapsu/tap/delta` work. The formula installs a release of Delta, builds it with Node 24, and runs it as a `brew services` service. User guide: [docs/homebrew.md](../docs/homebrew.md).

- `Formula/delta.rb`: the formula. Its `url` and `sha256` point at one release.
- `.github/workflows/bump.yml`: hourly, moves the formula to Delta's latest release, builds and tests it on macOS, and pushes. No secrets needed.

To change the formula, edit it here and copy it to the tap (keep the tap's current `url` and `sha256`).
