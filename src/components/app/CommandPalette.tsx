import {
  ArrowLeftRight,
  CornerDownLeft,
  FolderOpen,
  Plus,
  Search,
  Server,
  SquareCode,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NavKey } from "@/components/app/IconRail";
import {
  loadSnippets,
  loadTunnels,
  startTunnel,
  stopTunnel,
  type Host,
  type Snippet,
  type Tunnel,
} from "@/lib/backend";
import { t } from "@/lib/i18n";
import { terminalFor } from "@/lib/terminals";
import { describeTunnel } from "@/lib/tunnels";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  section: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  run: () => void;
}

/** Lower is better; null when `query` is not a subsequence of `text`. */
function score(text: string, query: string): number | null {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const direct = haystack.indexOf(query);
  if (direct >= 0) return direct;
  let position = -1;
  let gaps = 0;
  for (const char of query) {
    const next = haystack.indexOf(char, position + 1);
    if (next < 0) return null;
    gaps += next - position - 1;
    position = next;
  }
  return 100 + gaps;
}

export function CommandPalette({
  hosts,
  activeKey,
  activeHostTab,
  onClose,
  onOpenHost,
  onOpenLocal,
  onNewHost,
  onToggleFiles,
  onNav,
}: {
  hosts: Host[];
  activeKey: string | null;
  activeHostTab: boolean;
  onClose: () => void;
  onOpenHost: (host: Host) => void;
  onOpenLocal: () => void;
  onNewHost: () => void;
  onToggleFiles: () => void;
  onNav: (nav: NavKey) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSnippets().then(setSnippets).catch(console.error);
    loadTunnels().then(setTunnels).catch(console.error);
  }, []);

  const items = useMemo<Item[]>(() => {
    const terminal = terminalFor(activeKey);
    const actions: Item[] = [
      { id: "local", section: t.paletteActions, title: t.openLocal, icon: SquareTerminal, run: onOpenLocal },
      { id: "new-host", section: t.paletteActions, title: t.newHost, icon: Plus, run: onNewHost },
      ...(activeHostTab
        ? [{ id: "files", section: t.paletteActions, title: t.toggleFiles, icon: FolderOpen, run: onToggleFiles }]
        : []),
      { id: "nav-forwards", section: t.paletteActions, title: t.navForwards, icon: ArrowLeftRight, run: () => onNav("forwards") },
      { id: "nav-snippets", section: t.paletteActions, title: t.navSnippets, icon: SquareCode, run: () => onNav("snippets") },
    ];
    return [
      ...hosts.map((host) => ({
        id: `host-${host.id}`,
        section: t.navHosts,
        title: host.name,
        subtitle: host.target,
        icon: Server,
        run: () => onOpenHost(host),
      })),
      ...(terminal
        ? snippets.map((snippet) => ({
            id: `snippet-${snippet.id}`,
            section: t.navSnippets,
            title: snippet.name,
            subtitle: snippet.content,
            icon: SquareCode,
            run: () => terminal.send(snippet.content, true),
          }))
        : []),
      ...tunnels.map((tunnel) => {
        const running = tunnel.status.state === "running" || tunnel.status.state === "starting";
        return {
          id: `tunnel-${tunnel.id}`,
          section: t.navForwards,
          title: `${running ? t.stopTunnel : t.startTunnel} ${tunnel.name}`,
          subtitle: describeTunnel(tunnel),
          icon: ArrowLeftRight,
          run: () => void (running ? stopTunnel(tunnel.id) : startTunnel(tunnel.id)).catch(console.error),
        };
      }),
      ...actions,
    ];
  }, [hosts, snippets, tunnels, activeKey, activeHostTab, onOpenHost, onOpenLocal, onNewHost, onToggleFiles, onNav]);

  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const scored = items
      .map((item) => ({ item, score: score(`${item.title} ${item.subtitle ?? ""}`, normalized) }))
      .filter((entry): entry is { item: Item; score: number } => entry.score !== null);
    if (normalized) scored.sort((a, b) => a.score - b.score);
    return scored.map((entry) => entry.item).slice(0, 50);
  }, [items, normalized]);

  useEffect(() => setIndex(0), [normalized]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex justify-center bg-(--shadow-color) px-6 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.palette}
        className="flex max-h-[70vh] w-full max-w-xl animate-page-in flex-col overflow-hidden rounded-lg bg-bg-elevated shadow-3"
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-5 shrink-0 text-label-3" strokeWidth={1.5} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") setIndex((current) => Math.min(current + 1, visible.length - 1));
              else if (event.key === "ArrowUp") setIndex((current) => Math.max(current - 1, 0));
              else if (event.key === "Enter") choose(visible[index]);
              else if (event.key === "Escape") onClose();
              else return;
              event.preventDefault();
            }}
            placeholder={t.palettePlaceholder}
            aria-label={t.palette}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={visible[index] ? `palette-${visible[index].id}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-body text-label-1 outline-none placeholder:text-label-3"
          />
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="min-h-0 overflow-y-auto p-2">
          {visible.length === 0 && <p className="px-3 py-6 text-center text-callout text-label-2">{t.paletteEmpty}</p>}
          {visible.map((item, position) => {
            const showSection = !normalized && (position === 0 || visible[position - 1].section !== item.section);
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {showSection && <p className="px-3 pt-2 pb-1 text-caption text-label-3">{item.section}</p>}
                <div
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={position === index}
                  data-index={position}
                  onMouseMove={() => setIndex(position)}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-sm px-3",
                    position === index ? "bg-accent-soft" : undefined,
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", position === index ? "text-(--accent)" : "text-label-2")}
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 flex-1 truncate text-callout text-label-1">{item.title}</span>
                  {item.subtitle && (
                    <span className="max-w-[45%] truncate font-mono text-caption font-normal text-label-3">
                      {item.subtitle}
                    </span>
                  )}
                  {position === index && <CornerDownLeft className="size-4 shrink-0 text-label-3" strokeWidth={1.5} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
