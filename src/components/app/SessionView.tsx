import { CircleAlert, Check, Copy, SquareTerminal } from "lucide-react";
import { useEffect, useState } from "react";
import { HostTile } from "@/components/app/HostList";
import { Button } from "@/components/ui/button";
import { openExternal, type Host } from "@/lib/backend";
import { t } from "@/lib/i18n";

/** Tab content until the embedded terminal lands in v0.6. */
export function SessionView({ host }: { host: Host }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(host.command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const open = async () => {
    setError(null);
    try {
      await openExternal(host.id);
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <div className="flex h-full animate-page-in items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-lg bg-bg-elevated p-6 shadow-1 ring-1 ring-separator">
        <div className="flex items-center gap-4">
          <HostTile host={host} large />
          <div className="min-w-0">
            <h1 className="truncate text-title-3">{host.name}</h1>
            <p className="selectable truncate font-mono text-callout text-label-2">{host.target}</p>
          </div>
        </div>

        <code className="mt-6 block truncate rounded-sm bg-fill-1 px-3 py-2 font-mono text-callout text-label-1">
          {host.command}
        </code>

        <p className="mt-4 text-callout text-label-2">{t.terminalSoon}</p>

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2 text-callout text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>
              {t.openFailed}: {error}
            </span>
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" onClick={open}>
            <SquareTerminal />
            {t.openExternal}
          </Button>
          <Button variant="secondary" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? t.copied : t.copyCommand}
          </Button>
        </div>
      </div>
    </div>
  );
}
