# AnixOps SSH

A clean, Termius-style SSH client for the system OpenSSH. Hosts on the left,
sessions in tabs, files beside the terminal, nothing you do not need.

AnixOps SSH never implements the SSH protocol and never stores passwords or
private keys. Every session runs your own `ssh`, so `~/.ssh/config`,
`ProxyJump`, `known_hosts`, the system SSH agent and the 1Password SSH agent
all work as they already do.

> Status: v0.5 in progress. The app shell and host list are in place; the
> embedded terminal arrives in v0.6. See [ROADMAP.md](ROADMAP.md).

## Stack

| Layer | Choice |
|---|---|
| Shell | [Tauri 2](https://tauri.app) |
| UI | React, Tailwind CSS v4, shadcn/ui, [AnixOps Design](https://github.com/AnixOps/AnixOps-design) tokens |
| Terminal (v0.6) | xterm.js on a PTY running the system `ssh` |
| Core | `crates/easyssh-core`: OpenSSH invocation, `~/.ssh/config` discovery, non-sensitive config storage |

## Development

```bash
npm install
npm run dev          # UI only, in a browser, with preview data
npm run tauri dev    # the desktop app (needs Rust and the Tauri prerequisites)
```

CI builds and tests every push on Windows, macOS and Linux, captures UI
screenshots in light and dark, and uploads installers as workflow artifacts.

## Security boundary

- Connection metadata is stored in a local JSON file in the OS configuration
  directory. Fields that look like secrets are rejected on load and save.
- Child processes inherit `PATH`, `HOME`, `USERPROFILE` and `SSH_AUTH_SOCK`.
- The frontend receives display data only; launching a session goes back
  through `easyssh-core`, which validates every argument.

## License

MIT. The AnixOps mark, wordmark and icons are covered by the AnixOps brand
license in the design repository.
