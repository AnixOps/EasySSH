import type { HostsSnapshot, SessionEvent, SessionHandle } from "./backend";

/** Mirrors `display_command` in src-tauri/src/hosts.rs. */
function previewCommand(target: string): string {
  const [destination, port] = target.split(":");
  return port ? `ssh -p ${port} ${destination}` : `ssh ${destination}`;
}

/** Fixed sample data for browser previews and CI screenshots.
 *  `?hosts=empty` shows the first-run state. */
export function previewSnapshot(): HostsSnapshot {
  if (new URLSearchParams(window.location.search).get("hosts") === "empty") {
    return { hosts: [], groups: [], warnings: [] };
  }
  const host = (
    id: string,
    name: string,
    target: string,
    groupId: string | null,
    extra: { favorite?: boolean; color?: string; tags?: string[] } = {},
  ) => ({
    id,
    name,
    target,
    command: previewCommand(target),
    groupId,
    tags: extra.tags ?? [],
    favorite: extra.favorite ?? false,
    color: extra.color ?? null,
    source: "saved" as const,
  });
  return {
    groups: [
      { id: "prod", name: "生产", color: null },
      { id: "staging", name: "测试", color: null },
      { id: "home", name: "个人", color: null },
    ],
    hosts: [
      host("1", "prod-web-01", "deploy@10.0.1.11", "prod", { favorite: true, color: "#4F5BE8" }),
      host("2", "prod-web-02", "deploy@10.0.1.12", "prod"),
      host("3", "prod-db", "postgres@10.0.2.20", "prod", { favorite: true }),
      host("4", "staging-api", "ubuntu@staging.internal:2222", "staging"),
      host("5", "home-nas", "admin@192.168.1.10", "home", { favorite: true }),
      host("6", "raspberry-pi", "pi@192.168.1.42", "home"),
      {
        id: "ssh-config:bastion",
        name: "bastion",
        target: "bastion",
        command: "ssh bastion",
        groupId: null,
        tags: [],
        favorite: false,
        color: null,
        source: "ssh_config",
      },
    ],
    warnings: [],
  };
}

/** A fake session with local echo, so the terminal can be previewed and
 *  screenshotted without a backend. `exit` closes it to show the ended state. */
export function previewSession(
  hostId: string | null,
  onEvent: (event: SessionEvent) => void,
): SessionHandle {
  const host = hostId?.replace("ssh-config:", "") ?? "local";
  const user = hostId ? "deploy" : "you";
  const prompt = `[1;32m${user}@${host}[0m:[1;34m~[0m$ `;
  let line = "";
  let closed = false;
  const emit = (data: string) => !closed && onEvent({ kind: "data", data });
  const banner = hostId
    ? [
        `Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)`,
        "",
        `  System load:  0.08              Processes:       142`,
        `  Usage of /:   37.2% of 78.12GB  Users logged in: 1`,
        `  Memory usage: 41%               IPv4 address:    10.0.1.11`,
        "",
        `[33m3 updates can be applied immediately.[0m`,
        `Last login: Tue Oct 14 09:12:03 2026 from 192.168.1.20`,
        "",
      ]
    : [];
  window.setTimeout(() => emit(banner.map((text) => `${text}
`).join("") + prompt), 120);
  const run = (command: string) => {
    if (command === "exit") {
      emit("logout
");
      closed = true;
      onEvent({ kind: "exit", code: 0 });
      return;
    }
    if (command === "ls") {
      emit("[1;34mapp[0m  [1;34mlogs[0m  deploy.sh  [32mstart.sh[0m  README.md
");
    } else if (command) {
      emit(`${command.split(" ")[0]}: command not found
`);
    }
    emit(prompt);
  };
  return {
    write(data) {
      for (const char of data) {
        if (char === "") {
          emit("
");
          run(line.trim());
          line = "";
        } else if (char === "") {
          if (line) {
            line = line.slice(0, -1);
            emit(" ");
          }
        } else if (char >= " ") {
          line += char;
          emit(char);
        }
      }
    },
    resize() {},
    close() {
      closed = true;
    },
  };
}
