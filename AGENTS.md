# Working on AnixOps SSH

## Ground rules

- The owner decides product direction and architecture; agents write the
  code. Architecture changes go into README/ROADMAP first and wait for
  approval.
- One feature per branch and pull request. Merge only with green CI.
- No unattended "retry until it passes" automation. After two failed CI
  attempts on the same problem, stop and report the evidence.
- Never connect to real hosts or read the user's SSH configuration in tests.

## Building

Nothing is compiled locally. CI (`.github/workflows/ci.yml`) runs on every
push: frontend typecheck and build, Playwright screenshots in light and dark,
then `cargo fmt`, `clippy -D warnings`, `cargo test` and `tauri build` on
Windows, macOS and Linux.

Results (logs, screenshots, lockfiles) are force-pushed to the branch
`ci-results/<branch>`; read them with
`git fetch origin ci-results/<branch>` and `git show FETCH_HEAD:<path>`.

## Branches and releases

- Work on a feature branch, open a PR with `gh pr create`, squash-merge once
  CI is green, and delete the branch (`gh pr merge --squash --delete-branch`).
  Deleting a branch also deletes its `ci-results/<branch>` (cleanup.yml).
- To release, bump the version in `Cargo.toml` (workspace), `package.json`
  and `src-tauri/tauri.conf.json`, merge that to `main`, then tag `main` with
  `vX.Y.Z` and push the tag. release.yml checks the versions match, builds on
  all three platforms and publishes a GitHub Release with the installers.

## UI rules

- Use only AnixOps Design tokens (`src/design/`, vendored, do not edit) and
  the Tailwind utilities generated from them. No literal colours.
- Icons are Lucide at stroke 1.5; 20 px in navigation, 16 px in buttons.
  Icon-only buttons need an `aria-label` and a tooltip.
- Motion 120–280 ms, opacity and transform only; respect reduced motion.
- All user-facing strings live in `src/lib/i18n.ts` (Chinese and English).
- `npm run dev` without Tauri uses `src/lib/preview.ts`; keep it in step with
  the backend types so screenshots stay meaningful.
