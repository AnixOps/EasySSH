# Roadmap

Goal: a Termius-style client that stays small. Every version ships a
downloadable build.

| Version | Theme | Scope |
|---|---|---|
| **v0.5** | Foundation | Tauri 2 + React shell on AnixOps Design; icon rail, host list (saved hosts and `~/.ssh/config`), tabs; open in system terminal; CI on three platforms with screenshots and installers |
| v0.6 | Embedded terminal | xterm.js tabs on a PTY running the system `ssh`; truecolor, copy/paste, scrollback, search, font and theme, one-click reconnect; local shell tab |
| v0.7 | SFTP pane | One long-lived `sftp` process per host; side pane next to the terminal; drag and drop; transfer queue with progress and cancel |
| v0.8 | Productivity | Snippets panel (send to one or many tabs); port-forward manager (`ssh -N`, one switch per tunnel); Ctrl+K command palette; host editor |
| v1.0 | Polish | Settings (theme, language, terminal), first-run checks for ssh and the agent, config export/import and git sync, docs |

## Not doing

Team features and accounts, our own cloud sync, storing passwords or private
keys, our own SSH protocol implementation, mobile apps, AI assistants. Split
panes only after v1.0 if there is a real need.
