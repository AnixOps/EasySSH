# Roadmap

Goal: a Termius-style client that stays small. Every version ships a
downloadable build.

## Done

| Version | Theme | Scope |
|---|---|---|
| v0.5 | Foundation | Tauri 2 + React shell on AnixOps Design; host list; tabs; CI on three platforms |
| v0.6 | Embedded terminal | xterm.js tabs on a PTY running the system `ssh`; local shell tab |
| v0.7 | SFTP pane | Long-lived `sftp` per pane; transfers; password prompts through `SSH_ASKPASS` |
| v0.8 | Productivity | Host editor, snippets, port forwarding, command palette |
| v1.0 | Polish | Settings, SSH environment check, export, import and Git sync, user guide |
| v1.0.1 | Motion | Motion in the macOS and Linear style; browser preview site |

## What drives the work

In order of weight:

1. **Real servers in CI.** End-to-end tests against an OpenSSH server
   container: terminal, sftp, tunnels and password prompts. Until these
   exist, a green build only proves the code compiles and renders.
2. **Daily use.** The owner uses the app instead of their usual SSH client
   and files every rough edge as a GitHub issue. Started 2026-10-14; 1.1 is
   planned from these issues after two weeks.
3. **User issues**, with the version, OS and `ssh -V` attached.
4. **Comparison with Termius, Xshell and FinalShell**, for frequent tasks
   only.

No usage telemetry: issues and diagnostics are enough, and it would not fit
an app that refuses to handle passwords.

## Next

Ordered by what daily use turns up; the candidates below are the current
best guess.

| Version | Theme | Candidates |
|---|---|---|
| v1.1 | Reliability | End-to-end tests against a real OpenSSH server; fixes they and daily use find; automatic updates; a "copy diagnostics" button |
| v1.2 | Everyday speed | Restore tabs after restart; import hosts from Xshell, FinalShell and Termius; manage `known_hosts`; terminal colour schemes |
| v1.3 | Reach | Universal macOS build (Intel and Apple silicon); Linux arm64; Windows signing once there are users to protect |
| Later | Only on demand | Split panes; sharing one connection between terminal and files; fewer password prompts for repeated transfers |

## Not doing

Team features and accounts, our own cloud sync, storing passwords or private
keys, our own SSH protocol implementation, mobile apps, AI assistants.

How versions are numbered and shipped: [RELEASING.md](RELEASING.md).
