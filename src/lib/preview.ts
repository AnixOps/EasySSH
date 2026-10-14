import type { HostsSnapshot } from "./backend";

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

