import { ArrowLeftRight, Maximize2, PanelLeftClose, PanelLeftOpen, Server, Settings, SquareCode, Users, type LucideIcon } from "lucide-react";
import mark from "@/assets/mark.svg";
import { Tooltip } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n";
import { shortcutHint, type ShortcutId } from "@/lib/shortcutTable";
import { useUpdateStatus } from "@/lib/updateStore";
import { cn } from "@/lib/utils";

export type NavKey = "hosts" | "forwards" | "snippets" | "team" | "settings";

const primary: { key: NavKey; label: string; icon: LucideIcon }[] = [
  { key: "hosts", label: t.navHosts, icon: Server },
  { key: "forwards", label: t.navForwards, icon: ArrowLeftRight },
  { key: "snippets", label: t.navSnippets, icon: SquareCode },
  { key: "team", label: t.navTeam, icon: Users },
];

export function IconRail({
  active,
  sidebarHidden = false,
  onChange,
  onToggleSidebar,
  onFocusMode,
}: {
  active: NavKey;
  /** The section's panel is hidden; choosing the active section shows it again. */
  sidebarHidden?: boolean;
  onChange: (key: NavKey) => void;
  onToggleSidebar?: () => void;
  /** Hides the rail and the sidebar, leaving the tabs and the terminal. */
  onFocusMode?: () => void;
}) {
  const updates = useUpdateStatus();
  const updateFound = Boolean(updates?.update);
  return (
    <nav
      aria-label="AnixOps SSH"
      className="material-sidebar flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3"
    >
      <img src={mark} alt="AnixOps SSH" className="mb-3 size-8" draggable={false} />
      {primary.map((item) => (
        <RailButton key={item.key} item={item} active={active === item.key} open={!sidebarHidden} onChange={onChange} />
      ))}
      <div className="flex-1" />
      {onFocusMode && (
        <RailAction label={t.focusMode} hint={shortcutHint("toggle-focus")} icon={Maximize2} onClick={onFocusMode} />
      )}
      {onToggleSidebar && (
        <RailAction
          label={sidebarHidden ? t.showSidebar : t.hideSidebar}
          hint={shortcutHint("toggle-sidebar")}
          icon={sidebarHidden ? PanelLeftOpen : PanelLeftClose}
          expanded={!sidebarHidden}
          onClick={onToggleSidebar}
        />
      )}
      <RailButton
        item={{ key: "settings", label: t.navSettings, icon: Settings }}
        active={active === "settings"}
        open={!sidebarHidden}
        badge={updateFound ? t.updatesBadge : undefined}
        onChange={onChange}
      />
    </nav>
  );
}

/** A command at the foot of the rail (not a section). */
function RailAction({
  label,
  hint,
  icon: Icon,
  expanded,
  onClick,
}: {
  label: string;
  hint: string;
  icon: LucideIcon;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={hint ? `${label} (${hint})` : label} side="right">
      <button
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        onClick={onClick}
        className="flex size-10 items-center justify-center rounded-sm text-label-2 transition-colors duration-micro ease-standard hover:bg-fill-1 hover:text-label-1"
      >
        <Icon className="size-5" strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}

function RailButton({
  item,
  active,
  open,
  badge,
  onChange,
}: {
  item: { key: NavKey; label: string; icon: LucideIcon };
  active: boolean;
  open: boolean;
  /** A dot on the icon, and these words in the tooltip and description. */
  badge?: string;
  onChange: (key: NavKey) => void;
}) {
  const Icon = item.icon;
  const hint = shortcutHint(item.key === "settings" ? "settings" : (`go-${item.key}` as ShortcutId));
  const name = badge ? `${item.label} · ${badge}` : item.label;
  const label = hint ? `${name} (${hint})` : name;
  // The open section's button folds the sidebar away; its tooltip says so.
  const toggle = shortcutHint("toggle-sidebar");
  return (
    <Tooltip label={active ? `${open ? t.hideSidebar : t.showSidebar} (${toggle})` : label} side="right">
      <button
        type="button"
        aria-label={item.label}
        aria-description={badge}
        aria-current={active ? "page" : undefined}
        aria-expanded={active ? open : undefined}
        onClick={() => onChange(item.key)}
        className={cn(
          "relative flex size-10 items-center justify-center rounded-sm transition-colors duration-micro ease-standard",
          active && open
            ? "bg-accent-soft text-(--accent)"
            : active
              ? "text-(--accent) hover:bg-fill-1"
              : "text-label-2 hover:bg-fill-1 hover:text-label-1",
        )}
      >
        <Icon className="size-5" strokeWidth={1.5} />
        {badge && (
          <span aria-hidden className="absolute top-2 right-2 size-2 rounded-pill bg-accent-fill ring-2 ring-bg" />
        )}
      </button>
    </Tooltip>
  );
}
