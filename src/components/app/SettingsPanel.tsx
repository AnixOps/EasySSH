import { getVersion } from "@tauri-apps/api/app";
import { AiSettings } from "@/components/app/AiSettings";
import { SessionLogs } from "@/components/app/SessionLogs";
import { BackupSync } from "@/components/app/BackupSync";
import { KnownHosts } from "@/components/app/KnownHosts";
import { SyncSettings } from "@/components/app/SyncSettings";
import { VaultSettings } from "@/components/app/VaultSettings";
import {
  CircleAlert,
  CircleArrowUp,
  CircleCheck,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Folder,
  LockKeyhole,
  Minus,
  Network,
  Plus,
  RefreshCw,
  RotateCw,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SettingsFilter, SettingsPageTitle, SettingsRow, SettingsGroup } from "@/components/ui/settings";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import {
  isTauri,
  monospaceFonts,
  telemetryDeletePending,
  telemetryPending,
  telemetryStatus,
  updateCancel,
  updateCheck,
  updateInstall,
  updateOpen,
  updateSetAuto,
  type SshStatus,
} from "@/lib/backend";
import { isCancel, megabytes, percent, updateState, type InstallSupport, type UpdateStatus } from "@/lib/update";
import { setUpdateStatus, useUpdateStatus } from "@/lib/updateStore";
import { completionPrefs, onCompletionPrefs, updateCompletionPrefs } from "@/lib/completion/prefs";
import { onTransferPrefs, transferPrefs, updateTransferPrefs } from "@/lib/terminalTransferPrefs";
import { t } from "@/lib/i18n";
import { resolveFontFamily } from "@/lib/terminalOptions";
import type { LocaleSetting, ThemeSetting } from "@/lib/prefsMirror";
import { onSettings, settings, updateSettings, type Settings } from "@/lib/settings";
import { isMac } from "@/lib/shortcuts";
import { pendingText, privacyView, type TelemetryStatus } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

const SCROLLBACK = [1000, 5000, 10000, 50000, 100000];
const LINE_HEIGHTS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];
const FONT_LIST_ID = "terminal-font-list";

/** The settings pages (brand template "Settings": a left list, grouped rows).
 *  Everyday pages first, rarely used ones last (actions.md H5). */
export type SettingsSection = "general" | "terminal" | "files" | "connections" | "security" | "ai" | "logs" | "sync" | "privacy";

export const SETTINGS_SECTIONS: { key: SettingsSection; label: string; icon: LucideIcon }[] = [
  { key: "general", label: t.settingsGeneral, icon: SlidersHorizontal },
  { key: "terminal", label: t.terminal, icon: SquareTerminal },
  { key: "files", label: t.files, icon: Folder },
  { key: "connections", label: t.settingsConnections, icon: Network },
  { key: "security", label: t.security, icon: LockKeyhole },
  { key: "ai", label: t.aiTitle, icon: Sparkles },
  { key: "logs", label: t.logsTitle, icon: ScrollText },
  { key: "sync", label: t.settingsSyncBackup, icon: RefreshCw },
  { key: "privacy", label: t.privacy, icon: ShieldCheck },
];

/** The settings sidebar: search, then one row per page. */
export function SettingsNav({
  section,
  query,
  onSection,
  onQuery,
}: {
  section: SettingsSection;
  query: string;
  onSection: (section: SettingsSection) => void;
  onQuery: (query: string) => void;
}) {
  const searching = query.trim() !== "";
  return (
    <aside className="material-sidebar flex w-72 shrink-0 flex-col border-r">
      <h2 className="px-4 pt-4 pb-2 text-title-3">{t.navSettings}</h2>
      {/* Search, as Windows Terminal, VS Code and Termius settings have it. */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label-3" strokeWidth={1.5} />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                onQuery("");
              }
            }}
            placeholder={t.searchSettings}
            aria-label={t.searchSettings}
            className="pl-9"
          />
        </div>
      </div>
      <nav aria-label={t.settingsSections} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {SETTINGS_SECTIONS.map(({ key, label, icon: Icon }) => {
          const selected = !searching && key === section;
          return (
            <button
              key={key}
              type="button"
              data-settings-nav={key}
              aria-current={selected ? "page" : undefined}
              onClick={() => {
                onQuery("");
                onSection(key);
              }}
              className={cn(
                "flex min-h-9 w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-body transition-colors duration-micro ease-standard",
                selected ? "bg-accent-soft text-label-1" : "text-label-1 hover:bg-fill-1",
              )}
            >
              <Icon className={cn("size-4 shrink-0", selected ? "text-(--accent)" : "text-label-2")} strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/** One settings page beside the list, or every page's matching rows while
 *  searching. It covers the workspace (sessions keep running underneath) and
 *  keeps rows at a readable width (density.md N22: 692 px). */
export function SettingsPage({
  section,
  query,
  showPicker,
  onSection,
  onClose,
  status,
  onRecheck,
  onDataChanged,
}: {
  section: SettingsSection;
  query: string;
  /** The sidebar is hidden: the page header carries the page picker. */
  showPicker: boolean;
  onSection: (section: SettingsSection) => void;
  onClose: () => void;
  status: SshStatus | null;
  onRecheck: () => void;
  onDataChanged: () => void;
}) {
  const [current, setCurrent] = useState<Settings>(settings());
  const [prefs, setPrefs] = useState(completionPrefs());
  const [transferState, setTransferState] = useState(transferPrefs());
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [editor, setEditor] = useState(settings().editorCommand);
  const [fonts, setFonts] = useState<string[]>([]);
  const [fontText, setFontText] = useState(settings().terminalFontFamily);

  useEffect(() => onSettings((next) => (setCurrent(next), setEditor(next.editorCommand))), []);
  useEffect(() => setFontText(current.terminalFontFamily), [current.terminalFontFamily]);
  useEffect(() => {
    monospaceFonts().then(setFonts).catch(console.error);
  }, []);
  useEffect(() => onCompletionPrefs(setPrefs), []);
  useEffect(() => onTransferPrefs(setTransferState), []);
  useEffect(() => {
    if (isTauri) getVersion().then(setVersion).catch(console.error);
    else setVersion("preview");
  }, []);

  const update = (patch: Partial<Settings>) => {
    setError(null);
    updateSettings(patch).catch((reason) => setError(String(reason)));
  };

  const themes: { value: ThemeSetting; label: string }[] = [
    { value: "system", label: t.themeSystem },
    { value: "light", label: t.themeLight },
    { value: "dark", label: t.themeDark },
  ];


  // Esc goes back to the sessions, unless a field, menu or dialog takes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("[role=dialog], [role=alertdialog], [role=menu], [role=listbox]")) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const searching = query.trim() !== "";
  const visible = searching ? SETTINGS_SECTIONS : SETTINGS_SECTIONS.filter((item) => item.key === section);
  const title = SETTINGS_SECTIONS.find((item) => item.key === section)?.label ?? t.navSettings;

  const content = (key: SettingsSection): ReactNode => {
    switch (key) {
      case "general":
        return (
          <>
            <SettingsGroup title={t.appearance}>
              <SettingsRow label={t.theme}>
                <Segmented
                  size="sm"
                  value={current.theme}
                  onChange={(theme) => update({ theme })}
                  label={t.theme}
                  options={themes}
                />
              </SettingsRow>
              <SettingsRow label={t.language}>
                <Select
                  aria-label={t.language}
                  value={current.locale}
                  onChange={(event) => update({ locale: event.target.value as LocaleSetting })}
                  className="h-7 w-auto"
                >
                  <option value="system">{t.languageSystem}</option>
                  <option value="zh_cn">简体中文</option>
                  <option value="en">English</option>
                </Select>
              </SettingsRow>
            </SettingsGroup>
            <SettingsGroup title={t.updatesTitle}>
              <UpdatesSection version={version} />
            </SettingsGroup>
            <SettingsGroup title={t.about}>
              <SettingsRow label="AnixOps SSH">
                <span className="text-callout text-label-2">
                  {t.version} {version}
                </span>
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case "terminal":
        return (
          <>
            {!searching && <TerminalPreview current={current} />}
            <SettingsGroup title={t.terminal}>
              <SettingsRow label={t.fontSize}>
                <div className="flex items-center gap-1">
                  <Stepper
                    label={`${t.fontSize} −`}
                    disabled={current.terminalFontSize <= 9}
                    onClick={() => update({ terminalFontSize: current.terminalFontSize - 1 })}
                  >
                    <Minus />
                  </Stepper>
                  <span className="w-7 text-center font-mono text-callout tabular-nums">{current.terminalFontSize}</span>
                  <Stepper
                    label={`${t.fontSize} +`}
                    disabled={current.terminalFontSize >= 32}
                    onClick={() => update({ terminalFontSize: current.terminalFontSize + 1 })}
                  >
                    <Plus />
                  </Stepper>
                </div>
              </SettingsRow>
              <SettingsRow label={t.fontFamily} hint={t.fontFamilyHint} stacked>
                <Input
                  aria-label={t.fontFamily}
                  list={FONT_LIST_ID}
                  value={fontText}
                  placeholder={t.fontFamilyDefault}
                  onChange={(event) => setFontText(event.target.value)}
                  onBlur={() => fontText.trim() !== current.terminalFontFamily && update({ terminalFontFamily: fontText.trim() })}
                  onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                  className="h-7"
                />
                <datalist id={FONT_LIST_ID}>
                  {fonts.map((family) => (
                    <option key={family} value={family} />
                  ))}
                </datalist>
              </SettingsRow>
              <SettingsRow label={t.ligatures} hint={t.ligaturesHint}>
                <Switch
                  on={current.terminalLigatures}
                  label={t.ligatures}
                  onClick={() => update({ terminalLigatures: !current.terminalLigatures })}
                />
              </SettingsRow>
              <SettingsRow label={t.lineHeight}>
                <Select
                  aria-label={t.lineHeight}
                  value={current.terminalLineHeight}
                  onChange={(event) => update({ terminalLineHeight: Number(event.target.value) })}
                  className="h-7 w-auto"
                >
                  {LINE_HEIGHTS.map((height) => (
                    <option key={height} value={height}>
                      {height.toFixed(1)}
                    </option>
                  ))}
                </Select>
              </SettingsRow>
              <SettingsRow label={t.cursorStyle}>
                <Segmented
                  size="sm"
                  value={current.terminalCursorStyle}
                  onChange={(terminalCursorStyle) => update({ terminalCursorStyle })}
                  label={t.cursorStyle}
                  options={[
                    { value: "block", label: t.cursorBlock },
                    { value: "bar", label: t.cursorBar },
                    { value: "underline", label: t.cursorUnderline },
                  ]}
                />
              </SettingsRow>
              <SettingsRow label={t.cursorBlink}>
                <Switch
                  on={current.terminalCursorBlink}
                  label={t.cursorBlink}
                  onClick={() => update({ terminalCursorBlink: !current.terminalCursorBlink })}
                />
              </SettingsRow>
              <SettingsRow label={t.scrollback}>
                <Select
                  aria-label={t.scrollback}
                  value={current.terminalScrollback}
                  onChange={(event) => update({ terminalScrollback: Number(event.target.value) })}
                  className="h-7 w-auto"
                >
                  {SCROLLBACK.map((lines) => (
                    <option key={lines} value={lines}>
                      {lines.toLocaleString()} {t.lines}
                    </option>
                  ))}
                </Select>
              </SettingsRow>
              <SettingsRow
                label={t.rightClick}
                hint={current.terminalRightClick === "paste" ? t.rightClickPasteHint : undefined}
              >
                <Segmented
                  size="sm"
                  value={current.terminalRightClick}
                  onChange={(terminalRightClick) => update({ terminalRightClick })}
                  label={t.rightClick}
                  options={[
                    { value: "menu", label: t.rightClickMenu },
                    { value: "paste", label: t.rightClickPaste },
                  ]}
                />
              </SettingsRow>
              <SettingsRow label={t.copyOnSelect}>
                <Switch
                  on={current.terminalCopyOnSelect}
                  label={t.copyOnSelect}
                  onClick={() => update({ terminalCopyOnSelect: !current.terminalCopyOnSelect })}
                />
              </SettingsRow>
              {!isMac && (
                <SettingsRow label={t.ctrlCopyPaste} hint={t.ctrlCopyPasteHint}>
                  <Switch
                    on={current.terminalCtrlCopyPaste}
                    label={t.ctrlCopyPaste}
                    onClick={() => update({ terminalCtrlCopyPaste: !current.terminalCtrlCopyPaste })}
                  />
                </SettingsRow>
              )}
              <SettingsRow
                label={t.mouseReporting}
                hint={
                  current.terminalMouseReporting
                    ? t.mouseReportingHint.replace("{key}", isMac ? "Option" : "Shift")
                    : t.mouseReportingOffHint
                }
              >
                <Switch
                  on={current.terminalMouseReporting}
                  label={t.mouseReporting}
                  onClick={() => update({ terminalMouseReporting: !current.terminalMouseReporting })}
                />
              </SettingsRow>
              <SettingsRow label={t.warnMultilinePaste} hint={t.warnMultilinePasteHint}>
                <Switch
                  on={current.terminalWarnMultilinePaste}
                  label={t.warnMultilinePaste}
                  onClick={() => update({ terminalWarnMultilinePaste: !current.terminalWarnMultilinePaste })}
                />
              </SettingsRow>
              <SettingsRow label={t.osc52} hint={t.osc52Hint}>
                <Switch
                  on={current.terminalOsc52}
                  label={t.osc52}
                  onClick={() => update({ terminalOsc52: !current.terminalOsc52 })}
                />
              </SettingsRow>
              <SettingsRow label={t.autoReconnect} hint={t.autoReconnectHint}>
                <Switch
                  on={current.terminalAutoReconnect}
                  label={t.autoReconnect}
                  onClick={() => update({ terminalAutoReconnect: !current.terminalAutoReconnect })}
                />
              </SettingsRow>
              {isMac && (
                <SettingsRow label={t.optionAsMeta} hint={t.optionAsMetaHint}>
                  <Switch
                    on={current.terminalOptionAsMeta}
                    label={t.optionAsMeta}
                    onClick={() => update({ terminalOptionAsMeta: !current.terminalOptionAsMeta })}
                  />
                </SettingsRow>
              )}
              <SettingsRow label={t.fileTransfer} hint={t.fileTransferHint}>
                <Switch
                  on={transferState.enabled}
                  label={t.fileTransfer}
                  onClick={() => updateTransferPrefs({ enabled: !transferState.enabled })}
                />
              </SettingsRow>
              <SettingsRow label={t.askSavePath} hint={t.askSavePathHint}>
                <Switch
                  on={transferState.askWhere}
                  label={t.askSavePath}
                  onClick={() => updateTransferPrefs({ askWhere: !transferState.askWhere })}
                />
              </SettingsRow>
            </SettingsGroup>
            <SettingsGroup title={t.completion}>
              <SettingsRow label={t.completionEnabled} hint={t.completionHint}>
                <Switch on={prefs.enabled} label={t.completionEnabled} onClick={() => updateCompletionPrefs({ enabled: !prefs.enabled })} />
              </SettingsRow>
              <SettingsRow label={t.rememberHistory} hint={t.rememberHistoryHint}>
                <Switch
                  on={prefs.rememberHistory}
                  label={t.rememberHistory}
                  onClick={() => updateCompletionPrefs({ rememberHistory: !prefs.rememberHistory })}
                />
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case "files":
        return (
          <>
            <SettingsGroup title={t.files}>
              <SettingsRow label={t.filesDoubleClick}>
                <Segmented
                  value={current.filesDoubleClick}
                  onChange={(value) => update({ filesDoubleClick: value })}
                  label={t.filesDoubleClick}
                  options={[
                    { value: "edit", label: t.filesDoubleClickEdit },
                    { value: "download", label: t.filesDoubleClickDownload },
                  ]}
                />
              </SettingsRow>
              <SettingsRow label={t.editorCommand} hint={t.editorCommandHint} stacked>
                <Input
                  value={editor}
                  onChange={(event) => setEditor(event.target.value)}
                  onBlur={() => editor.trim() !== current.editorCommand && update({ editorCommand: editor.trim() })}
                  onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                  placeholder={t.editorCommandPlaceholder}
                  aria-label={t.editorCommand}
                  spellCheck={false}
                  className="h-7 font-mono text-callout"
                />
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case "connections":
        return (
          <>
            <SettingsGroup
              title={t.sshEnvironment}
              action={
                <Tooltip label={t.recheck}>
                  <Button variant="quiet" size="icon-sm" aria-label={t.recheck} onClick={onRecheck}>
                    <RotateCw />
                  </Button>
                </Tooltip>
              }
            >
              <StatusRow
                label={t.openssh}
                ok={!status || Boolean(status.sshVersion)}
                value={status ? (status.sshVersion?.split(",")[0] ?? t.notFound) : "…"}
              />
              <StatusRow label={t.sftpLabel} ok={!status || status.sftpFound} value={status ? (status.sftpFound ? t.available : t.notFound) : "…"} />
              <StatusRow
                label={t.agentLabel}
                ok={!status || status.agent === "ready"}
                warn={status?.agent === "empty"}
                value={
                  !status
                    ? "…"
                    : status.agent === "ready"
                      ? `${status.agentKeys.length} ${t.agentReady}${status.agentKind === "pageant" ? ` · ${t.agentPageant}` : status.agentKind === "openssh" ? ` · ${t.agentOpenSsh}` : ""}`
                      : status.agent === "empty"
                        ? `${t.agentEmpty}${status.agentKind === "pageant" ? ` · ${t.agentPageant}` : status.agentKind === "openssh" ? ` · ${t.agentOpenSsh}` : ""}`
                        : t.agentUnavailable
                }
              />
              <StatusRow label={t.sshConfigLabel} ok value={status ? `${status.sshConfigHosts} ${t.hostsCount}` : "…"} />
              {status && status.agentKeys.length > 0 && (
                <div className="space-y-1 px-3 py-2">
                  {status.agentKeys.map((key) => (
                    <p key={key} className="selectable truncate font-mono text-callout text-label-3" title={key}>
                      {key}
                    </p>
                  ))}
                </div>
              )}
            </SettingsGroup>
            <SettingsGroup title={t.knownHosts}>
              <KnownHosts />
            </SettingsGroup>
            <SettingsGroup title={t.advanced}>
              <SettingsRow label={t.sshEngineLabel} hint={current.sshEngine === "russh" ? t.sshEngineRusshHint : t.sshEngineOpensshHint}>
                <Segmented
                  size="sm"
                  value={current.sshEngine}
                  onChange={(sshEngine) => update({ sshEngine })}
                  label={t.sshEngineLabel}
                  options={[
                    { value: "russh", label: t.engineBuiltin },
                    { value: "openssh", label: t.engineOpenssh },
                  ]}
                />
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case "security":
        return (
          <>
            <SettingsGroup title={t.security}>
              <VaultSettings />
            </SettingsGroup>
          </>
        );
      case "ai":
        return (
          <>
            <SettingsGroup title={t.aiTitle}>
              <AiSettings />
            </SettingsGroup>
          </>
        );
      case "logs":
        return (
          <>
            <SettingsGroup title={t.logsTitle}>
              <SessionLogs />
            </SettingsGroup>
          </>
        );
      case "sync":
        return (
          <>
            <SettingsGroup title={t.syncTitle}>
              <SyncSettings />
            </SettingsGroup>
            <SettingsGroup title={t.backupSync}>
              <BackupSync onChanged={onDataChanged} />
            </SettingsGroup>
          </>
        );
      case "privacy":
        return (
          <>
            <SettingsGroup title={t.privacy}>
              <PrivacySection current={current} update={update} />
            </SettingsGroup>
          </>
        );
    }
  };

  return (
    <div data-settings-page className="absolute inset-0 z-10 overflow-y-auto bg-bg">
      <SettingsFilter query={query}>
        <div className={cn("settings-list mx-auto w-full max-w-[692px] space-y-8 px-6 pt-5 pb-10", searching && "searching")}>
          {!searching && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="min-w-0 flex-1 text-title-2">{title}</h1>
              {showPicker && (
                <Select
                  aria-label={t.settingsSections}
                  value={section}
                  onChange={(event) => onSection(event.target.value as SettingsSection)}
                  className="h-7 w-auto max-w-full"
                >
                  {SETTINGS_SECTIONS.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
          <p className="settings-empty hidden pt-6 text-center text-callout text-label-2">{t.noMatchingSettings}</p>
          {error && <p className="rounded-sm bg-danger-soft px-3 py-2 text-callout text-danger">{error}</p>}
          {visible.map((item) => (
            <SettingsPageTitle key={item.key} title={item.label}>
              <div data-settings-section={item.key} className="space-y-6">
                {searching && <h2 className="px-1 text-callout font-semibold text-label-2">{item.label}</h2>}
                {content(item.key)}
              </div>
            </SettingsPageTitle>
          ))}
        </div>
      </SettingsFilter>
    </div>
  );
}

/** A few lines in the chosen font, size, line height and cursor, so a change
 *  shows here while the sessions are covered (as Windows Terminal's preview). */
function TerminalPreview({ current }: { current: Settings }) {
  const cursor =
    current.terminalCursorStyle === "bar"
      ? "border-l-2 border-(--accent)"
      : current.terminalCursorStyle === "underline"
        ? "border-b-2 border-(--accent)"
        : "bg-(--accent)";
  return (
    <div
      aria-hidden
      data-layout-ignore
      className={cn(
        "overflow-hidden rounded-md bg-bg px-4 py-3 whitespace-pre text-label-1 shadow-1 ring-1 ring-separator",
        current.terminalLigatures ? "[font-variant-ligatures:common-ligatures_contextual]" : "[font-variant-ligatures:none]",
      )}
      style={{
        fontFamily: resolveFontFamily(current.terminalFontFamily, "var(--font-app-mono), monospace"),
        fontSize: current.terminalFontSize,
        lineHeight: current.terminalLineHeight,
      }}
    >
      <div>
        <span className="text-success">deploy@prod-web-01</span>:<span className="text-(--accent)">~</span>$ ls -l
      </div>
      <div className="text-label-2">drwxr-xr-x 4 deploy deploy 4096 releases</div>
      <div>{"=> != -> === <= >="}</div>
      <div>
        <span className="text-success">deploy@prod-web-01</span>:<span className="text-(--accent)">~</span>${" "}
        <span className={cn("inline-block h-[1.1em] w-[0.6em] align-text-bottom", cursor)} />
      </div>
    </div>
  );
}

function StatusRow({ label, value, ok, warn = false }: { label: string; value: string; ok: boolean; warn?: boolean }) {
  return (
    <SettingsRow label={label}>
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-callout",
          ok ? "text-label-2" : warn ? "text-warning" : "text-danger",
        )}
      >
        {ok ? (
          <CircleCheck className="size-3.5 shrink-0 text-success" strokeWidth={1.5} />
        ) : (
          <CircleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
        )}
        <span className="truncate">{value}</span>
      </span>
    </SettingsRow>
  );
}

function Stepper({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="secondary" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

/** The backend verifies the signed feed; "Update and restart" downloads the
 *  installer, verifies it the same way, installs it and starts the new
 *  version. Installations it cannot update (a .deb) get the release page. */
function UpdatesSection({ version }: { version: string }) {
  const status = useUpdateStatus();
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const checkNow = () => {
    setChecking(true);
    setFailure(null);
    updateCheck()
      .then(setUpdateStatus)
      .catch((reason) => setFailure(String(reason)))
      .finally(() => setChecking(false));
  };

  const toggle = () => {
    if (!status) return;
    updateSetAuto(!status.autoCheck)
      .then(setUpdateStatus)
      .catch((reason) => setFailure(String(reason)));
  };

  if (!status) return null;
  const state = updateState(status);
  const checkedAt = status.lastChecked ? new Date(status.lastChecked * 1000).toLocaleString() : t.never;
  const found = status.update;
  const busy = status.progress.phase !== null;

  return (
    <>
      <SettingsRow
        label={`${t.version} ${version}`}
        hint={
          state === "unavailable"
            ? undefined
            : `${state === "current" ? `${t.updatesUpToDate} · ` : ""}${t.updatesLastChecked} ${checkedAt}`
        }
      >
        {state !== "unavailable" && (
          <Button variant="secondary" size="sm" onClick={checkNow} disabled={checking || busy}>
            <RotateCw />
            {checking ? t.updatesChecking : t.updatesCheckNow}
          </Button>
        )}
      </SettingsRow>
      {state === "unavailable" ? (
        <p className="px-4 py-2 text-callout text-label-2">{t.updatesUnavailable}</p>
      ) : (
        <SettingsRow label={t.updatesAuto} hint={t.updatesAutoHint}>
          <Switch on={status.autoCheck} label={t.updatesAuto} onClick={toggle} />
        </SettingsRow>
      )}
      {failure && (
        <p className="selectable px-4 py-2 text-callout text-danger">
          {t.updatesFailed}: {failure}
        </p>
      )}
      {found && <FoundUpdate status={status} version={found.version} notes={found.notes} />}
    </>
  );
}

/** A newer release: install it, watch it install, or (where the app cannot
 *  replace itself) why not and where to get it. */
function FoundUpdate({ status, version, notes }: { status: UpdateStatus; version: string; notes: string }) {
  const [failure, setFailure] = useState<string | null>(null);
  const { phase } = status.progress;
  const auto = status.install === "auto";

  const install = () => {
    setFailure(null);
    updateInstall().catch((reason) => {
      if (!isCancel(reason)) setFailure(String(reason));
    });
  };
  const open = () => updateOpen().catch((reason) => setFailure(String(reason)));

  const blocked: Record<Exclude<InstallSupport, "auto">, string> = {
    package: t.updatesInstallPackage,
    moveToApplications: t.updatesInstallMove,
    noPermission: t.updatesInstallNoPermission,
    none: t.updatesInstallNone,
  };
  const phaseText =
    phase === "downloading"
      ? `${t.updatesDownloading} ${percent(status.progress)}%`
      : phase === "verifying"
        ? t.updatesVerifying
        : phase === "installing"
          ? t.updatesInstalling
          : t.updatesRestarting;

  return (
    <div className="space-y-2 px-4 py-3" data-settings-row>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 grow basis-40">
          <p className="flex items-center gap-2 text-body text-label-1">
            <CircleArrowUp className="size-4 shrink-0 text-(--accent)" strokeWidth={1.5} aria-hidden />
            <span className="min-w-0 truncate">
              {t.updatesAvailable} · {version}
            </span>
          </p>
          {phase && (
            <p className="flex flex-wrap gap-x-2 text-callout text-label-2 tabular-nums" aria-live="polite">
              <span className="whitespace-nowrap">{phaseText}</span>
              {phase === "downloading" && <span className="whitespace-nowrap">{megabytes(status.progress)}</span>}
            </p>
          )}
        </div>
        <div className="ml-auto flex max-w-full items-center">
          {phase === null ? (
            auto ? (
              <Button variant="primary" size="sm" onClick={install}>
                <Download />
                {t.updatesInstall}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={open}>
                <ExternalLink />
                {t.updatesOpenRelease}
              </Button>
            )
          ) : (
            (phase === "downloading" || phase === "verifying") && (
              <Button variant="secondary" size="sm" onClick={() => void updateCancel()}>
                {t.cancel}
              </Button>
            )
          )}
        </div>
      </div>
      {phase && (
        <div
          className="h-1 overflow-hidden rounded-pill bg-fill-2"
          role="progressbar"
          aria-label={t.updatesDownloading}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={phase === "downloading" ? percent(status.progress) : 100}
        >
          <div
            className="h-full origin-left rounded-pill bg-accent-fill transition-transform duration-micro ease-standard"
            style={{ transform: `scaleX(${phase === "downloading" ? percent(status.progress) / 100 : 1})` }}
          />
        </div>
      )}
      {phase === null && (
        <p className="text-callout text-label-2">
          {auto ? (status.closesSessions ? t.updatesInstallHintCloses : t.updatesInstallHint) : blocked[status.install as Exclude<InstallSupport, "auto">]}
        </p>
      )}
      {failure && <p className="selectable text-callout text-danger">{failure}</p>}
      {notes && <p className="selectable whitespace-pre-wrap text-callout text-label-2">{notes}</p>}
    </div>
  );
}

function PrivacySection({ current, update }: { current: Settings; update: (patch: Partial<Settings>) => void }) {
  const [status, setStatus] = useState<TelemetryStatus | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => telemetryStatus().then(setStatus).catch(console.error);
  useEffect(() => {
    refresh();
  }, [current.crashReports]);

  const view = privacyView(current, status);

  const toggleView = () => {
    if (pending !== null) {
      setPending(null);
      return;
    }
    setNotice(null);
    telemetryPending()
      .then((found) => setPending(pendingText(found) || t.pendingNone))
      .catch(console.error);
  };

  const remove = () => {
    telemetryDeletePending()
      .then(() => {
        setPending(null);
        setNotice(t.pendingDeleted);
        return refresh();
      })
      .catch(console.error);
  };

  if (view.nothingCollected && status) {
    return <p className="px-3 py-2 text-callout text-label-2">{t.telemetryUnavailable}</p>;
  }

  return (
    <>
      <SettingsRow label={t.crashReports} hint={t.crashReportsHint}>
        <Switch
          on={view.crashOn}
          label={t.crashReports}
          onClick={() => update({ crashReports: !view.crashOn })}
        />
      </SettingsRow>
      <SettingsRow label={t.usageStats} hint={view.usageAvailable ? t.usageStatsHint : t.usageUnavailable}>
        <Switch
          on={view.usageOn}
          label={t.usageStats}
          onClick={() => view.usageAvailable && update({ usageStats: !view.usageOn })}
        />
      </SettingsRow>
      <div className="space-y-2 px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={toggleView}>
            {pending === null ? <Eye /> : <EyeOff />}
            {pending === null ? t.viewPending : t.hidePending}
          </Button>
          <Button variant="secondary" size="sm" onClick={remove} disabled={!status || status.pending === 0}>
            <Trash2 />
            {t.deletePending}
          </Button>
        </div>
        {status && status.pending > 0 && (
          <p className="text-callout text-label-2">
            {status.pending} {t.pendingCount}
          </p>
        )}
        {notice && <p className="text-callout text-label-2">{notice}</p>}
        {pending !== null && (
          <pre
            aria-label={t.viewPending}
            className="selectable max-h-48 overflow-auto rounded-xs bg-fill-1 p-2 font-mono text-callout whitespace-pre-wrap break-all text-label-2"
          >
            {pending}
          </pre>
        )}
      </div>
    </>
  );
}
