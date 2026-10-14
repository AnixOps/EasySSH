import { FolderOpen, LoaderCircle, Plus, SquareTerminal, Unplug, X } from "lucide-react";
import type { SessionStatus } from "@/components/app/TerminalView";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n";
import { shortcutLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export interface Tab {
  key: string;
  /** null for a local shell. */
  hostId: string | null;
  title: string;
  color: string | null;
  status: SessionStatus;
  filesOpen: boolean;
  /** Set once the pane has been opened; it then stays mounted so transfers survive closing it. */
  filesMounted: boolean;
}

export function TabBar({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onNew,
  onToggleFiles,
}: {
  tabs: Tab[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onNew: () => void;
  onToggleFiles: () => void;
}) {
  const activeTab = tabs.find((tab) => tab.key === activeKey);
  return (
    <div className="material-bar flex h-11 shrink-0 items-center gap-1 border-b px-2">
      <div role="tablist" className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <div
              key={tab.key}
              className={cn(
                "group flex h-8 max-w-52 shrink-0 items-center rounded-sm transition-colors duration-micro ease-standard",
                active
                  ? "bg-bg-elevated text-label-1 shadow-1 ring-1 ring-separator"
                  : "text-label-2 hover:bg-fill-1",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(tab.key)}
                onAuxClick={(event) => event.button === 1 && onClose(tab.key)}
                className="flex h-full min-w-0 items-center gap-2 pl-3 text-callout"
              >
                <TabIcon tab={tab} />
                <span className="truncate">{tab.title}</span>
              </button>
              <Tooltip label={`${t.closeTab} (${shortcutLabel("w")})`}>
                <button
                  type="button"
                  aria-label={t.closeTab}
                  onClick={() => onClose(tab.key)}
                  className={cn(
                    "mx-1 flex size-5 items-center justify-center rounded-xs text-label-3 hover:bg-fill-2 hover:text-label-1",
                    !active && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  )}
                >
                  <X className="size-3.5" strokeWidth={1.5} />
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>
      <Tooltip label={`${t.newTab} (${shortcutLabel("t")})`}>
        <Button variant="ghost" size="icon-sm" aria-label={t.newTab} onClick={onNew}>
          <Plus />
        </Button>
      </Tooltip>
      {activeTab?.hostId && (
        <Tooltip label={`${t.toggleFiles} (${shortcutLabel("e")})`}>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={activeTab.filesOpen}
            onClick={onToggleFiles}
            className={cn("ml-auto", activeTab.filesOpen && "bg-accent-soft text-(--accent) hover:bg-accent-soft hover:text-(--accent)")}
          >
            <FolderOpen />
            {t.files}
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

/** Status is shown as an icon with an accessible label, never colour alone. */
function TabIcon({ tab }: { tab: Tab }) {
  const icon = "size-3.5 shrink-0";
  if (tab.status.state === "connecting") {
    return (
      <LoaderCircle
        className={cn(icon, "animate-spin text-label-3 motion-reduce:animate-none")}
        strokeWidth={1.5}
        aria-label={t.connecting}
      />
    );
  }
  if (tab.status.state === "exited") {
    return <Unplug className={cn(icon, "text-label-3")} strokeWidth={1.5} aria-label={t.sessionEnded} />;
  }
  if (tab.hostId === null) {
    return <SquareTerminal className={cn(icon, "text-label-2")} strokeWidth={1.5} aria-label={t.connected} />;
  }
  return (
    <span
      role="img"
      aria-label={t.connected}
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: tab.color ?? "var(--accent)" }}
    />
  );
}
