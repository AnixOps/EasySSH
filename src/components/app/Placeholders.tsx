import { ArrowLeftRight, Settings, SquareCode, SquareTerminal, type LucideIcon } from "lucide-react";
import mark from "@/assets/mark.svg";
import type { NavKey } from "@/components/app/IconRail";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { shortcutLabel } from "@/lib/shortcuts";

export function EmptyWorkspace({ onOpenLocal }: { onOpenLocal: () => void }) {
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

const panels: Record<Exclude<NavKey, "hosts">, { title: string; body: string; icon: LucideIcon }> = {
  forwards: { title: t.navForwards, body: t.forwardsSoon, icon: ArrowLeftRight },
  snippets: { title: t.navSnippets, body: t.snippetsSoon, icon: SquareCode },
  settings: { title: t.navSettings, body: t.settingsSoon, icon: Settings },
};

/** Second-column panel for sections that are not built yet. */
export function ComingSoonPanel({ nav }: { nav: Exclude<NavKey, "hosts"> }) {
  const panel = panels[nav];
  const Icon = panel.icon;
  return (
    <aside className="material-sidebar flex w-72 shrink-0 flex-col border-r">
      <h2 className="px-4 pt-4 text-title-3">{panel.title}</h2>
      <div className="flex flex-1 flex-col items-center px-6 pt-12 text-center">
        <Icon className="mb-3 size-12 text-label-3" strokeWidth={1.5} />
        <span className="rounded-pill bg-fill-2 px-2.5 py-0.5 text-caption text-label-2">
          {t.comingSoon}
        </span>
        <p className="mt-3 text-callout text-label-2">{panel.body}</p>
      </div>
    </aside>
  );
}
