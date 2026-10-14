import { Info, SquareTerminal, TriangleAlert } from "lucide-react";
import mark from "@/assets/mark.svg";
import { Button } from "@/components/ui/button";
import type { SshStatus } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { shortcutLabel } from "@/lib/shortcuts";

export function EmptyWorkspace({ onOpenLocal, status }: { onOpenLocal: () => void; status: SshStatus | null }) {
  const shortcuts = [
    { label: t.shortcutSearch, keys: shortcutLabel("k") },
    { label: t.shortcutLocal, keys: shortcutLabel("t") },
    { label: t.shortcutClose, keys: shortcutLabel("w") },
  ];
  return (
    <div className="flex h-full animate-page-in flex-col items-center justify-center p-8 text-center">
      <img src={mark} alt="" className="mb-6 size-16" draggable={false} />
      <h1 className="text-title-2">{t.emptyTitle}</h1>
      <p className="mt-2 max-w-sm text-callout text-label-2">{t.emptyHint}</p>
      {status && !status.sshVersion && (
        <div
          role="alert"
          className="mt-6 flex max-w-md items-start gap-3 rounded-md bg-warning-soft px-4 py-3 text-left"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" strokeWidth={1.5} />
          <div>
            <p className="text-callout font-semibold text-label-1">{t.sshMissingTitle}</p>
            <p className="mt-1 text-caption font-normal text-label-2">{t.sshMissingHint}</p>
          </div>
        </div>
      )}
      {status?.sshVersion && status.agent === "unavailable" && (
        <p className="mt-4 flex max-w-md items-start gap-2 text-left text-caption font-normal text-label-2">
          <Info className="mt-px size-4 shrink-0" strokeWidth={1.5} />
          {t.agentHint}
        </p>
      )}
      <Button variant="secondary" className="mt-6" onClick={onOpenLocal}>
        <SquareTerminal />
        {t.openLocal}
      </Button>
      <dl className="mt-10 grid grid-cols-[auto_auto] gap-x-6 gap-y-2 text-callout">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.label} className="contents">
            <dt className="text-right text-label-2">{shortcut.label}</dt>
            <dd className="text-left">
              <kbd className="rounded-xs bg-fill-1 px-1.5 py-0.5 font-sans text-caption text-label-2">
                {shortcut.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
