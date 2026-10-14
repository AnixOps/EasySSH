import { getVersion } from "@tauri-apps/api/app";
import { CircleAlert, CircleCheck, Minus, Plus, RotateCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { isTauri, type SshStatus } from "@/lib/backend";
import { t } from "@/lib/i18n";
import type { LocaleSetting, ThemeSetting } from "@/lib/prefsMirror";
import { onSettings, settings, updateSettings, type Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const SCROLLBACK = [1000, 5000, 10000, 50000, 100000];

export function SettingsPanel({ status, onRecheck }: { status: SshStatus | null; onRecheck: () => void }) {
  const [current, setCurrent] = useState<Settings>(settings());
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => onSettings(setCurrent), []);
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

  return (
    <aside className="material-sidebar flex w-72 shrink-0 flex-col border-r">
      <h2 className="px-4 pt-4 pb-2 text-title-3">{t.navSettings}</h2>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {error && <p className="rounded-sm bg-danger-soft px-3 py-2 text-caption font-normal text-danger">{error}</p>}

        <Group title={t.appearance}>
          <Row label={t.theme}>
            <div role="radiogroup" aria-label={t.theme} className="inline-flex rounded-pill bg-fill-1 p-0.5">
              {themes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={current.theme === option.value}
                  onClick={() => update({ theme: option.value })}
                  className={cn(
                    "h-6 rounded-pill px-2 text-caption transition-colors duration-toggle ease-standard",
                    current.theme === option.value
                      ? "bg-bg-elevated text-label-1 shadow-1"
                      : "font-normal text-label-2 hover:text-label-1",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Row>
          <Row label={t.language}>
            <select
              aria-label={t.language}
              value={current.locale}
              onChange={(event) => update({ locale: event.target.value as LocaleSetting })}
              className="h-7 rounded-xs bg-fill-1 px-2 text-callout text-label-1 outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            >
              <option value="system">{t.languageSystem}</option>
              <option value="zh_cn">简体中文</option>
              <option value="en">English</option>
            </select>
          </Row>
        </Group>

        <Group title={t.terminal}>
          <Row label={t.fontSize}>
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
          </Row>
          <Row label={t.scrollback}>
            <select
              aria-label={t.scrollback}
              value={current.terminalScrollback}
              onChange={(event) => update({ terminalScrollback: Number(event.target.value) })}
              className="h-7 rounded-xs bg-fill-1 px-2 text-callout text-label-1 outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            >
              {SCROLLBACK.map((lines) => (
                <option key={lines} value={lines}>
                  {lines.toLocaleString()} {t.lines}
                </option>
              ))}
            </select>
          </Row>
        </Group>

        <Group
          title={t.sshEnvironment}
          action={
            <Tooltip label={t.recheck}>
              <Button variant="ghost" size="icon-sm" aria-label={t.recheck} onClick={onRecheck}>
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
                  ? `${status.agentKeys.length} ${t.agentReady}`
                  : status.agent === "empty"
                    ? t.agentEmpty
                    : t.agentUnavailable
            }
          />
          <StatusRow label={t.sshConfigLabel} ok value={status ? `${status.sshConfigHosts} ${t.hostsCount}` : "…"} />
          {status && status.agentKeys.length > 0 && (
            <div className="space-y-1 px-3 py-2">
              {status.agentKeys.map((key) => (
                <p key={key} className="selectable truncate font-mono text-caption font-normal text-label-3" title={key}>
                  {key}
                </p>
              ))}
            </div>
          )}
        </Group>

        <Group title={t.about}>
          <Row label="AnixOps SSH">
            <span className="text-callout text-label-2">
              {t.version} {version}
            </span>
          </Row>
        </Group>
      </div>
    </aside>
  );
}

function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex h-7 items-center px-1">
        <h3 className="flex-1 text-caption text-label-2">{title}</h3>
        {action}
      </div>
      <div className="divide-y divide-separator overflow-hidden rounded-md bg-bg-elevated shadow-1 ring-1 ring-separator">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-callout text-label-1">{label}</span>
      {children}
    </div>
  );
}

function StatusRow({ label, value, ok, warn = false }: { label: string; value: string; ok: boolean; warn?: boolean }) {
  return (
    <Row label={label}>
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-caption font-normal",
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
    </Row>
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
