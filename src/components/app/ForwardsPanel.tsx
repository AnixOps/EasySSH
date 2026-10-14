import { ArrowLeftRight, CircleAlert, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { TunnelEditor } from "@/components/app/TunnelEditor";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  deleteTunnel,
  loadTunnels,
  onTunnelStatus,
  startTunnel,
  stopTunnel,
  type Host,
  type Tunnel,
} from "@/lib/backend";
import { t } from "@/lib/i18n";
import { appear, reflow } from "@/lib/motion";
import { describeTunnel } from "@/lib/tunnels";
import { cn } from "@/lib/utils";

export function ForwardsPanel({ hosts }: { hosts: Host[] }) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [editing, setEditing] = useState<Tunnel | null | undefined>(undefined);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadTunnels()
      .then(setTunnels)
      .catch((reason) => setError(String(reason)));
  }, []);
  useEffect(reload, [reload]);
  useEffect(
    () =>
      onTunnelStatus((id, status) =>
        setTunnels((current) => current.map((tunnel) => (tunnel.id === id ? { ...tunnel, status } : tunnel))),
      ),
    [],
  );

  const toggle = (tunnel: Tunnel) => {
    const active = tunnel.status.state === "running" || tunnel.status.state === "starting";
    (active ? stopTunnel(tunnel.id) : startTunnel(tunnel.id)).catch((reason) => setError(String(reason)));
  };

  const remove = (id: string) => {
    setConfirming(null);
    deleteTunnel(id)
      .then(reload)
      .catch((reason) => setError(String(reason)));
  };

  const hostName = (id: string) => hosts.find((host) => host.id === id)?.name ?? id.replace("ssh-config:", "");

  return (
    <aside className="material-sidebar flex w-72 shrink-0 flex-col border-r">
      <div className="flex h-15 items-center gap-2 px-4 pt-3 pb-2">
        <h2 className="flex-1 text-title-3">{t.navForwards}</h2>
        <Tooltip label={t.newTunnel}>
          <Button variant="secondary" size="icon" aria-label={t.newTunnel} onClick={() => setEditing(null)}>
            <Plus />
          </Button>
        </Tooltip>
      </div>

      {error && (
        <p className="mx-3 mb-2 rounded-sm bg-danger-soft px-3 py-2 text-caption font-normal text-danger">{error}</p>
      )}

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-3">
        {tunnels.length === 0 && (
          <div className="px-3 pt-10 text-center">
            <ArrowLeftRight className="mx-auto mb-3 size-12 text-label-3" strokeWidth={1.5} />
            <p className="text-callout font-semibold text-label-1">{t.noTunnels}</p>
            <p className="mt-1 text-caption font-normal text-label-2">{t.noTunnelsHint}</p>
          </div>
        )}
        <AnimatePresence initial={false}>
        {tunnels.map((tunnel) => {
          const on = tunnel.status.state === "running" || tunnel.status.state === "starting";
          return (
            <motion.div
              key={tunnel.id}
              layout="position"
              transition={reflow}
              {...appear}
              className="group rounded-sm px-3 py-2.5 hover:bg-fill-1"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-callout font-medium text-label-1">{tunnel.name}</p>
                  <p className="selectable truncate font-mono text-caption font-normal text-label-2">
                    {describeTunnel(tunnel)}
                  </p>
                  <p className="truncate text-caption font-normal text-label-3">{hostName(tunnel.hostId)}</p>
                </div>
                <Switch on={on} label={tunnel.name} onClick={() => toggle(tunnel)} />
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <TunnelState tunnel={tunnel} />
                {confirming === tunnel.id ? (
                  <span className="ml-auto flex gap-1">
                    <Button variant="destructive" size="sm" className="h-6 px-2" onClick={() => remove(tunnel.id)}>
                      {t.confirmDelete}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setConfirming(null)}>
                      {t.cancel}
                    </Button>
                  </span>
                ) : (
                  <span className="ml-auto flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <Tooltip label={t.edit}>
                      <Button variant="ghost" size="icon-sm" aria-label={t.edit} onClick={() => setEditing(tunnel)}>
                        <Pencil />
                      </Button>
                    </Tooltip>
                    <Tooltip label={t.delete}>
                      <Button variant="ghost" size="icon-sm" aria-label={t.delete} onClick={() => setConfirming(tunnel.id)}>
                        <Trash2 />
                      </Button>
                    </Tooltip>
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {editing !== undefined && (
        <TunnelEditor
          tunnel={editing}
          hosts={hosts}
          onCancel={() => setEditing(undefined)}
          onDone={() => {
            setEditing(undefined);
            reload();
          }}
        />
        )}
      </AnimatePresence>
    </aside>
  );
}

function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative mt-0.5 h-6 w-10 shrink-0 rounded-pill transition-colors duration-toggle ease-standard",
        on ? "bg-accent-fill" : "bg-fill-3",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-(--on-accent) shadow-1 transition-transform duration-toggle ease-emphasized",
          on && "translate-x-4",
        )}
      />
    </button>
  );
}

function TunnelState({ tunnel }: { tunnel: Tunnel }) {
  const text = "flex min-w-0 items-center gap-1.5 text-caption font-normal";
  switch (tunnel.status.state) {
    case "running":
      return (
        <span className={cn(text, "text-success")}>
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          {t.tunnelRunning}
        </span>
      );
    case "starting":
      return (
        <span className={cn(text, "text-label-2")}>
          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
          {t.tunnelStarting}
        </span>
      );
    case "failed":
      return (
        <Tooltip label={<span className="selectable block max-w-72 break-words">{tunnel.status.message}</span>}>
          <span className={cn(text, "text-danger")}>
            <CircleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{tunnel.status.message}</span>
          </span>
        </Tooltip>
      );
    default:
      return <span className={cn(text, "text-label-3")}>{t.tunnelStopped}</span>;
  }
}
