# Releasing

## Versions

Semantic versioning:

- **Patch** `1.0.x`: fixes only. Ship whenever a fix is ready.
- **Minor** `1.x.0`: features. About every four to six weeks.
- **Major** `2.0.0`: only if a saved configuration could no longer be read.
  Configuration changes are additive with defaults, so this should not
  happen; a user must never lose hosts to an upgrade.

## Rules for `main`

- `main` is always releasable. Changes land through pull requests.
- Branch protection requires the CI checks (frontend and screenshots, Rust
  on Windows, macOS and Linux) before merging.
- One feature per pull request, squash-merged, branch deleted afterwards.

## Shipping a version

1. Open a pull request that bumps the version in `Cargo.toml` (workspace),
   `package.json`, `src-tauri/tauri.conf.json`, and the two lockfiles.
2. When CI is green, run the smoke test below on one real machine against a
   real server. For a patch release, the checks touching the fix are enough.
3. Merge, then tag `main`: `git tag -a vX.Y.Z -m "AnixOps SSH X.Y.Z"` and
   push the tag. `release.yml` checks the versions, builds the installers on
   all three platforms, signs macOS when the Apple secrets exist
   ([docs/signing.md](docs/signing.md)) and publishes the release.
4. Watch the issues for a few days. A regression gets a patch release, not a
   revert of the tag.

If a release build fails for an external reason (a download returning 500,
a runner outage), re-run the failed job; do not change the code.

## Smoke test (about ten minutes)

Install the build from the CI run or release, then:

- [ ] The app starts; Settings → SSH environment shows OpenSSH and the agent.
- [ ] A host from `~/.ssh/config` and a saved host both open a terminal.
- [ ] A password-only host asks for the password in the terminal.
- [ ] `htop` or `vim` fills the window and follows a resize; Chinese text renders.
- [ ] Ctrl+Shift+C / V copy and paste; Ctrl+Shift+F finds text.
- [ ] `exit`, then Reconnect works.
- [ ] The file pane lists the home folder; upload by drag and drop and a download both finish.
- [ ] On a password-only host the file pane asks in a dialog.
- [ ] A local tunnel turns Running and its port answers; turning it off frees the port.
- [ ] Ctrl+Shift+K finds a host and opens it.
- [ ] Quitting the app leaves no `ssh` or `sftp` processes behind.
