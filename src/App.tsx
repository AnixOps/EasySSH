import { CircleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HostList } from "@/components/app/HostList";
import { IconRail, type NavKey } from "@/components/app/IconRail";
import { ComingSoonPanel, EmptyWorkspace } from "@/components/app/Placeholders";
import { TabBar, type Tab } from "@/components/app/TabBar";
import { TerminalView, type SessionStatus } from "@/components/app/TerminalView";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadHosts, type Host, type HostsSnapshot } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { appShortcut } from "@/lib/shortcuts";

let nextTab = 1;

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

  const addTab = useCallback((hostId: string | null, title: string, color: string | null) => {
    const key = `tab-${nextTab++}`;
    setTabs((current) => [...current, { key, hostId, title, color, status: { state: "connecting" } }]);
    setActiveKey(key);
  }, []);

  // Clicking a host focuses its open tab; a new session needs a closed tab.
  const openHost = useCallback(
    (host: Host) => {
      const existing = tabs.find((tab) => tab.hostId === host.id);
      if (existing) setActiveKey(existing.key);
      else addTab(host.id, host.name, host.color);
    },
    [tabs, addTab],
  );

  const openLocal = useCallback(() => addTab(null, t.localTerminal, null), [addTab]);

  const closeTab = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tab) => tab.key === key);
      const next = tabs.filter((tab) => tab.key !== key);
      setTabs(next);
      if (key === activeKey) setActiveKey(next[Math.min(index, next.length - 1)]?.key ?? null);
    },
    [tabs, activeKey],
  );

  // Stable so terminals do not restart their sessions when the app re-renders.
  const updateStatus = useCallback((key: string, status: SessionStatus) => {
    setTabs((current) => current.map((tab) => (tab.key === key ? { ...tab, status } : tab)));
  }, []);

  const focusSearch = useCallback(() => {
    setNav("hosts");
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = appShortcut(event);
      if (shortcut === "search-hosts") focusSearch();
      else if (shortcut === "new-local") openLocal();
      else if (shortcut === "close-tab" && activeKey) closeTab(activeKey);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeKey, closeTab, focusSearch, openLocal]);

  const activeTab = tabs.find((tab) => tab.key === activeKey);

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
              onNew={openLocal}
            />
          )}
          {loadError && (
            <p
              role="alert"
              className="m-4 flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2 text-callout text-danger"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>
                {t.loadFailed}: {loadError}
              </span>
            </p>
          )}
          <div className="min-h-0 flex-1">
            {tabs.map((tab) => (
              <TerminalView
                key={tab.key}
                tabKey={tab.key}
                hostId={tab.hostId}
                active={tab.key === activeKey}
                onStatus={updateStatus}
              />
            ))}
            {!activeTab && <EmptyWorkspace onOpenLocal={openLocal} />}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
