import { CircleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AskpassDialog } from "@/components/app/AskpassDialog";
import { CommandPalette } from "@/components/app/CommandPalette";
import { FilesPane } from "@/components/app/FilesPane";
import { ForwardsPanel } from "@/components/app/ForwardsPanel";
import { HostEditor } from "@/components/app/HostEditor";
import { HostList } from "@/components/app/HostList";
import { IconRail, type NavKey } from "@/components/app/IconRail";
import { EmptyWorkspace } from "@/components/app/Placeholders";
import { SettingsPanel } from "@/components/app/SettingsPanel";
import { SnippetsPanel } from "@/components/app/SnippetsPanel";
import { TabBar, type Tab } from "@/components/app/TabBar";
import { TerminalView, type SessionStatus } from "@/components/app/TerminalView";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadHosts, setFavorite, sshStatus, type Host, type HostsSnapshot, type SshStatus } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { loadSettings } from "@/lib/settings";
import { appShortcut } from "@/lib/shortcuts";

let nextTab = 1;

export function App() {
  const [nav, setNav] = useState<NavKey>("hosts");
  const [snapshot, setSnapshot] = useState<HostsSnapshot>({ hosts: [], groups: [], warnings: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // undefined: closed; null: a new host.
  const [editing, setEditing] = useState<Host | null | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [status, setStatus] = useState<SshStatus | null>(null);

  const checkSsh = useCallback(() => {
    setStatus(null);
    sshStatus().then(setStatus).catch(console.error);
  }, []);

  useEffect(() => {
    loadSettings().catch((reason) => setLoadError(String(reason)));
    checkSsh();
  }, [checkSsh]);
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    loadHosts()
      .then((next) => {
        setSnapshot(next);
        setLoadError(null);
      })
      .catch((reason) => setLoadError(String(reason)));
  }, []);

  useEffect(reload, [reload]);

  const toggleFavorite = useCallback(
    (host: Host) => {
      setFavorite(host.id, !host.favorite)
        .then(reload)
        .catch((reason) => setLoadError(String(reason)));
    },
    [reload],
  );

  const addTab = useCallback((hostId: string | null, title: string, color: string | null) => {
    const key = `tab-${nextTab++}`;
    setTabs((current) => [
      ...current,
      { key, hostId, title, color, status: { state: "connecting" }, filesOpen: false, filesMounted: false },
    ]);
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

  const setFilesOpen = useCallback((key: string, filesOpen: boolean) => {
    setTabs((current) => current.map((tab) => (tab.key === key && tab.hostId ? { ...tab, filesOpen, filesMounted: true } : tab)));
  }, []);

  const toggleFiles = useCallback(() => {
    const tab = tabs.find((candidate) => candidate.key === activeKey);
    if (tab) setFilesOpen(tab.key, !tab.filesOpen);
  }, [tabs, activeKey, setFilesOpen]);

  const focusSearch = useCallback(() => {
    setNav("hosts");
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = appShortcut(event);
      if (shortcut === "search-hosts") setPaletteOpen(true);
      else if (shortcut === "new-local") openLocal();
      else if (shortcut === "close-tab" && activeKey) closeTab(activeKey);
      else if (shortcut === "toggle-files") toggleFiles();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeKey, closeTab, focusSearch, openLocal, toggleFiles]);

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
            onEdit={setEditing}
            onToggleFavorite={toggleFavorite}
            searchRef={searchRef}
          />
        ) : nav === "snippets" ? (
          <SnippetsPanel activeKey={activeKey} />
        ) : nav === "forwards" ? (
          <ForwardsPanel hosts={snapshot.hosts} />
        ) : (
          <SettingsPanel status={status} onRecheck={checkSsh} onDataChanged={reload} />
        )}
        <main className="flex min-w-0 flex-1 flex-col bg-bg">
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeKey={activeKey}
              onSelect={setActiveKey}
              onClose={closeTab}
              onNew={openLocal}
              onToggleFiles={toggleFiles}
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
              <div key={tab.key} className="flex h-full" hidden={tab.key !== activeKey}>
                <TerminalView
                  tabKey={tab.key}
                  hostId={tab.hostId}
                  active={tab.key === activeKey}
                  onStatus={updateStatus}
                />
                {tab.hostId && tab.filesMounted && (
                  <FilesPane
                    hostId={tab.hostId}
                    visible={tab.filesOpen}
                    active={tab.key === activeKey && tab.filesOpen}
                    onClose={() => setFilesOpen(tab.key, false)}
                  />
                )}
              </div>
            ))}
            {!activeTab && <EmptyWorkspace onOpenLocal={openLocal} status={status} />}
          </div>
        </main>
      </div>
      {editing !== undefined && (
        <HostEditor
          host={editing}
          groups={snapshot.groups}
          onCancel={() => setEditing(undefined)}
          onDone={() => {
            setEditing(undefined);
            reload();
          }}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          hosts={snapshot.hosts}
          activeKey={activeKey}
          activeHostTab={Boolean(activeTab?.hostId)}
          onClose={() => setPaletteOpen(false)}
          onOpenHost={openHost}
          onOpenLocal={openLocal}
          onNewHost={() => setEditing(null)}
          onToggleFiles={toggleFiles}
          onNav={setNav}
        />
      )}
      <AskpassDialog />
    </TooltipProvider>
  );
}
