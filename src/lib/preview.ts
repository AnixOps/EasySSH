import type { Host, HostFields, HostInput, HostsSnapshot } from "./backend";

/** Mirrors `display_target` and `display_command` in src-tauri/src/hosts.rs. */
function describe(fields: HostFields): { target: string; command: string } {
  if (fields.alias) return { target: fields.alias, command: `ssh ${fields.alias}` };
  const user = fields.username ? `${fields.username}@` : "";
  const port = fields.port === 22 ? "" : `:${fields.port}`;
  const flag = fields.port === 22 ? "" : `-p ${fields.port} `;
  return { target: `${user}${fields.hostname}${port}`, command: `ssh ${flag}${user}${fields.hostname}` };
}

function endpoint(target: string): HostFields {
  const [userPart, rest] = target.includes("@") ? target.split("@") : [null, target];
  const [hostname, port] = rest.split(":");
  return { alias: null, hostname, username: userPart, port: port ? Number(port) : 22, proxyJump: null, notes: "" };
}

function makeHost(
  id: string,
  name: string,
  fields: HostFields,
  groupId: string | null,
  extra: { favorite?: boolean; color?: string; source?: Host["source"] } = {},
): Host {
  return {
    id,
    name,
    ...describe(fields),
    groupId,
    tags: [],
    favorite: extra.favorite ?? false,
    color: extra.color ?? null,
    source: extra.source ?? "saved",
    fields,
  };
}

/** Sample data for browser previews and CI screenshots, editable in memory.
 *  `?hosts=empty` shows the first-run state. */
const store: HostsSnapshot =
  new URLSearchParams(window.location.search).get("hosts") === "empty"
    ? { hosts: [], groups: [], warnings: [] }
    : {
        groups: [
          { id: "prod", name: "生产", color: null },
          { id: "staging", name: "测试", color: null },
          { id: "home", name: "个人", color: null },
        ],
        hosts: [
          makeHost("1", "prod-web-01", endpoint("deploy@10.0.1.11"), "prod", { favorite: true, color: "chart-1" }),
          makeHost("2", "prod-web-02", endpoint("deploy@10.0.1.12"), "prod"),
          makeHost("3", "prod-db", endpoint("postgres@10.0.2.20"), "prod", { favorite: true, color: "chart-5" }),
          makeHost("4", "staging-api", endpoint("ubuntu@staging.internal:2222"), "staging"),
          makeHost("5", "home-nas", endpoint("admin@192.168.1.10"), "home", { favorite: true }),
          makeHost("6", "raspberry-pi", endpoint("pi@192.168.1.42"), "home", { color: "chart-7" }),
          makeHost(
            "ssh-config:bastion",
            "bastion",
            { alias: "bastion", hostname: "", username: null, port: 22, proxyJump: null, notes: "" },
            null,
            { source: "ssh_config" },
          ),
        ],
        warnings: [],
      };

export function previewSnapshot(): HostsSnapshot {
  return structuredClone(store);
}

let nextId = 100;

export function previewSaveHost(input: HostInput): string {
  const groupName = input.group?.trim();
  let groupId: string | null = null;
  if (groupName) {
    const existing = store.groups.find((group) => group.name.toLowerCase() === groupName.toLowerCase());
    groupId = existing?.id ?? `group-${nextId++}`;
    if (!existing) store.groups.push({ id: groupId, name: groupName, color: null });
  }
  const saved = store.hosts.find((host) => host.id === input.id && host.source === "saved");
  const id = saved?.id ?? String(nextId++);
  const host = makeHost(id, input.name.trim(), input.fields, groupId, {
    favorite: input.favorite,
    color: input.color ?? undefined,
  });
  host.tags = input.tags;
  // Saving a ~/.ssh/config host turns it into a saved host, as in the app.
  if (input.id?.startsWith("ssh-config:")) store.hosts = store.hosts.filter((entry) => entry.id !== input.id);
  if (saved) store.hosts[store.hosts.indexOf(saved)] = host;
  else store.hosts.push(host);
  return id;
}

export function previewDeleteHost(id: string): void {
  store.hosts = store.hosts.filter((host) => host.id !== id);
}

export function previewSetFavorite(id: string, favorite: boolean): void {
  const host = store.hosts.find((candidate) => candidate.id === id);
  if (host) host.favorite = favorite;
}
