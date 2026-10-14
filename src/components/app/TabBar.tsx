import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface Tab {
  key: string;
  hostId: string;
  title: string;
  color: string | null;
}

export function TabBar({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: Tab[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onNew: () => void;
}) {
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
                active ? "bg-bg-elevated text-label-1 shadow-1" : "text-label-2 hover:bg-fill-1",
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
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tab.color ?? "var(--label-3)" }}
                />
                <span className="truncate">{tab.title}</span>
              </button>
              <Tooltip label={t.closeTab}>
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
      <Tooltip label={t.newTab}>
        <Button variant="ghost" size="icon-sm" aria-label={t.newTab} onClick={onNew}>
          <Plus />
        </Button>
      </Tooltip>
    </div>
  );
}
