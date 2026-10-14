import { CircleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HostList } from "@/components/app/HostList";
import { IconRail, type NavKey } from "@/components/app/IconRail";
import { ComingSoonPanel, EmptyWorkspace } from "@/components/app/Placeholders";
import { SessionView } from "@/components/app/SessionView";
import { TabBar, type Tab } from "@/components/app/TabBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadHosts, type Host, type HostsSnapshot } from "@/lib/backend";
import { t } from "@/lib/i18n";

export function App() {
  const [nav, setNav] = useState<NavKey>("hosts");
  const [snapshot, setSnapshot] = useState<HostsSnapshot>({ hosts: [], groups: [], warnings: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadHosts()
      .then(setSnapshot)
      .catch((reason) => setLoadError(String(reason)));
  }, []);

  // One tab per host for now; the embedded terminal will allow several.
  const openHost = useCallback((host: Host) => {
    setTabs((current) =>
      current.some((tab) => tab.key === host.id)
        ? current
        : [...current, { key: host.id, hostId: host.id, title: host.name, color: host.color }],
    );
    setActiveKey(host.id);
  }, []);

  const closeTab = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tab) => tab.key === key);
      const next = tabs.filter((tab) => tab.key !== key);
      setTabs(next);
      if (key === activeKey) setActiveKey(next[Math.min(index, next.length - 1)]?.key ?? null);
    },
    [tabs, activeKey],
  );

  const focusSearch = useCallback(() => {
    setNav("hosts");
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && (event.key === "k" || event.key === "t")) {
        event.preventDefault();
        focusSearch();
      } else if (mod && event.key === "w" && activeKey) {
        event.preventDefault();
        closeTab(activeKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeKey, closeTab, focusSearch]);

  const activeTab = tabs.find((tab) => tab.key === activeKey);
  const activeHost = activeTab && snapshot.hosts.find((host) => host.id === activeTab.hostId);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full">
        <IconRail active={nav} onChange={setNav} />
        {nav === "hosts" ? (
          <HostList
            hosts={snapshot.hosts}
            groups={snapshot.groups}
            selectedId={activeTab?.hostId ?? null}
            onOpen={openHost}
            searchRef={searchRef}
          />
        ) : (
          <ComingSoonPanel nav={nav} />
        )}
        <main className="flex min-w-0 flex-1 flex-col bg-bg">
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeKey={activeKey}
              onSelect={setActiveKey}
              onClose={closeTab}
              onNew={focusSearch}
            />
          )}
          {loadError && (
            <p role="alert" className="m-4 flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2 text-callout text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>
                {t.loadFailed}: {loadError}
              </span>
            </p>
          )}
          <div className="min-h-0 flex-1">
            {activeHost ? <SessionView key={activeHost.id} host={activeHost} /> : <EmptyWorkspace />}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
