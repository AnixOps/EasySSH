import { ChevronRight, Search, Server, Star } from "lucide-react";
import { useMemo, useState, type Ref } from "react";
import { Input } from "@/components/ui/input";
import { isTauri, type Group, type Host } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  title: string;
  hosts: Host[];
}

function buildSections(hosts: Host[], groups: Group[]): Section[] {
  const sections: Section[] = [];
  const favorites = hosts.filter((host) => host.favorite);
  if (favorites.length > 0) sections.push({ id: "favorites", title: t.favorites, hosts: favorites });
  for (const group of groups) {
    const members = hosts.filter((host) => host.groupId === group.id);
    if (members.length > 0) sections.push({ id: group.id, title: group.name, hosts: members });
  }
  const known = new Set(groups.map((group) => group.id));
  const ungrouped = hosts.filter(
    (host) => host.source === "saved" && (host.groupId === null || !known.has(host.groupId)),
  );
  if (ungrouped.length > 0) sections.push({ id: "ungrouped", title: t.ungrouped, hosts: ungrouped });
  const sshConfig = hosts.filter((host) => host.source === "ssh_config");
  if (sshConfig.length > 0) sections.push({ id: "ssh_config", title: t.fromSshConfig, hosts: sshConfig });
  return sections;
}

export function HostList({
  hosts,
  groups,
  selectedId,
  onOpen,
  searchRef,
}: {
  hosts: Host[];
  groups: Group[];
  selectedId: string | null;
  onOpen: (host: Host) => void;
  searchRef: Ref<HTMLInputElement>;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const normalized = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      hosts.filter(
        (host) =>
          host.name.toLowerCase().includes(normalized) ||
          host.target.toLowerCase().includes(normalized) ||
          host.tags.some((tag) => tag.toLowerCase().includes(normalized)),
      ),
    [hosts, normalized],
  );
  const sections = useMemo(() => buildSections(hosts, groups), [hosts, groups]);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="material-sidebar flex w-72 shrink-0 flex-col border-r">
      <div className="relative px-3 pt-3 pb-2">
        <Search
          className="pointer-events-none absolute top-1/2 left-6 mt-0.5 size-4 -translate-y-1/2 text-label-3"
          strokeWidth={1.5}
        />
        <Input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchHosts}
          aria-label={t.searchHosts}
          className="pl-9"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {hosts.length === 0 ? (
          <div className="px-3 pt-10 text-center">
            <Server className="mx-auto mb-3 size-12 text-label-3" strokeWidth={1.5} />
            <p className="text-callout font-semibold text-label-1">{t.noHosts}</p>
            <p className="mt-1 text-caption font-normal text-label-2">{t.noHostsHint}</p>
          </div>
        ) : normalized ? (
          matches.length === 0 ? (
            <p className="px-3 pt-6 text-center text-callout text-label-2">{t.noMatches}</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {matches.map((host) => (
                <HostRow key={host.id} host={host} selected={host.id === selectedId} onOpen={onOpen} />
              ))}
            </ul>
          )
        ) : (
          sections.map((section) => {
            const isCollapsed = collapsed.has(section.id);
            return (
              <section key={section.id} className="mt-2">
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  aria-expanded={!isCollapsed}
                  className="flex h-7 w-full items-center gap-1 rounded-xs px-2 text-caption text-label-2 hover:text-label-1"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 transition-transform duration-toggle ease-standard",
                      !isCollapsed && "rotate-90",
                    )}
                    strokeWidth={1.5}
                  />
                  <span className="truncate">{section.title}</span>
                  <span className="ml-auto font-normal text-label-3">{section.hosts.length}</span>
                </button>
                {!isCollapsed && (
                  <ul className="space-y-0.5">
                    {section.hosts.map((host) => (
                      <HostRow
                        key={host.id}
                        host={host}
                        selected={host.id === selectedId}
                        onOpen={onOpen}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>

      {!isTauri && (
        <p className="border-t px-4 py-2 text-caption font-normal text-label-3">{t.previewData}</p>
      )}
    </aside>
  );
}

function HostRow({
  host,
  selected,
  onOpen,
}: {
  host: Host;
  selected: boolean;
  onOpen: (host: Host) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(host)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "group flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors duration-micro ease-standard",
          selected ? "bg-accent-soft" : "hover:bg-fill-1",
        )}
      >
        <HostTile host={host} selected={selected} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-medium text-label-1">{host.name}</span>
          <span className="block truncate font-mono text-caption font-normal text-label-2">
            {host.target}
          </span>
        </span>
        {host.favorite && (
          <Star className="size-3.5 shrink-0 fill-current text-label-3" strokeWidth={1.5} aria-hidden />
        )}
      </button>
    </li>
  );
}

export function HostTile({ host, selected = false, large = false }: { host: Host; selected?: boolean; large?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-sm",
        large ? "size-12" : "size-8",
        selected ? "bg-bg-elevated text-(--accent) shadow-1" : "bg-fill-2 text-label-2",
      )}
    >
      <Server className={large ? "size-6" : "size-4"} strokeWidth={1.5} />
      {host.color && (
        <span
          aria-hidden
          className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-(--bg-grouped)"
          style={{ backgroundColor: host.color }}
        />
      )}
    </span>
  );
}
