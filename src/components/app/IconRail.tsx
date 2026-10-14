import { ArrowLeftRight, Server, Settings, SquareCode, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import mark from "@/assets/mark.svg";
import { Tooltip } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n";
import { slide } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type NavKey = "hosts" | "forwards" | "snippets" | "settings";

const primary: { key: NavKey; label: string; icon: LucideIcon }[] = [
  { key: "hosts", label: t.navHosts, icon: Server },
  { key: "forwards", label: t.navForwards, icon: ArrowLeftRight },
  { key: "snippets", label: t.navSnippets, icon: SquareCode },
];

export function IconRail({ active, onChange }: { active: NavKey; onChange: (key: NavKey) => void }) {
  return (
    <nav
      aria-label="AnixOps SSH"
      className="material-sidebar flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3"
    >
      <img src={mark} alt="AnixOps" className="mb-3 size-8" draggable={false} />
      {primary.map((item) => (
        <RailButton key={item.key} item={item} active={active === item.key} onChange={onChange} />
      ))}
      <div className="flex-1" />
      <RailButton
        item={{ key: "settings", label: t.navSettings, icon: Settings }}
        active={active === "settings"}
        onChange={onChange}
      />
    </nav>
  );
}

function RailButton({
  item,
  active,
  onChange,
}: {
  item: { key: NavKey; label: string; icon: LucideIcon };
  active: boolean;
  onChange: (key: NavKey) => void;
}) {
  const Icon = item.icon;
  return (
    <Tooltip label={item.label} side="right">
      <button
        type="button"
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        onClick={() => onChange(item.key)}
        className={cn(
          "relative flex size-10 items-center justify-center rounded-sm transition-[color,background-color,transform] duration-micro ease-standard active:scale-95",
          active ? "text-(--accent)" : "text-label-2 hover:bg-fill-1 hover:text-label-1",
        )}
      >
        {active && (
          <motion.span layoutId="rail-active" transition={slide} className="absolute inset-0 rounded-sm bg-accent-soft" />
        )}
        <Icon className="relative size-5" strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}
