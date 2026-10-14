import { CircleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Overlay } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/segmented";
import { saveTunnel, type Host, type Tunnel, type TunnelKind } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { describeTunnel } from "@/lib/tunnels";
import { cn } from "@/lib/utils";

export function TunnelEditor({
  tunnel,
  hosts,
  onDone,
  onCancel,
}: {
  tunnel: Tunnel | null;
  hosts: Host[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tunnel?.name ?? "");
  const [hostId, setHostId] = useState(tunnel?.hostId ?? hosts[0]?.id ?? "");
  const [kind, setKind] = useState<TunnelKind>(tunnel?.kind ?? "local");
  const [bindAddress, setBindAddress] = useState(tunnel?.bindAddress ?? "");
  const [bindPort, setBindPort] = useState(String(tunnel?.bindPort ?? ""));
  const [targetHost, setTargetHost] = useState(tunnel?.targetHost ?? "");
  const [targetPort, setTargetPort] = useState(String(tunnel?.targetPort ?? ""));
  const [error, setError] = useState<string | null>(null);

  const input = {
    id: tunnel?.id ?? null,
    name,
    hostId,
    kind,
    bindAddress: bindAddress.trim() || null,
    bindPort: Number(bindPort) || 0,
    targetHost: kind === "dynamic" ? null : targetHost.trim() || null,
    targetPort: kind === "dynamic" ? null : Number(targetPort) || null,
  };

  const submit = async () => {
    try {
      await saveTunnel(input);
      onDone();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const kinds: { value: TunnelKind; label: string; hint: string }[] = [
    { value: "local", label: t.tunnelLocal, hint: t.tunnelLocalHint },
    { value: "remote", label: t.tunnelRemote, hint: t.tunnelRemoteHint },
    { value: "dynamic", label: t.tunnelDynamic, hint: t.tunnelDynamicHint },
  ];

  return (
    <Overlay
      labelledBy="tunnel-editor-title"
      onDismiss={onCancel}
      onSubmit={() => void submit()}
      className="max-w-md space-y-5 p-6"
    >
        <h2 id="tunnel-editor-title" className="text-title-3">
          {tunnel ? t.editTunnel : t.newTunnel}
        </h2>

        <Field label={t.hostName}>
          <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t.tunnelNameExample} />
        </Field>

        <Field label={t.tunnelVia}>
          <select
            value={hostId}
            onChange={(event) => setHostId(event.target.value)}
            className="h-9 w-full rounded-sm bg-fill-1 px-3 text-callout text-label-1 outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
          >
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.name} — {host.target}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t.tunnelType} group>
          <Segmented value={kind} onChange={setKind} label={t.tunnelType} options={kinds} />
          <p className="mt-1.5 text-caption font-normal text-label-3">
            {kinds.find((option) => option.value === kind)?.hint}
          </p>
        </Field>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label={kind === "remote" ? t.tunnelServerAddress : t.tunnelBindAddress} hint={t.optional}>
            <Input value={bindAddress} onChange={(event) => setBindAddress(event.target.value)} placeholder="127.0.0.1" className="font-mono" />
          </Field>
          <Field label={kind === "remote" ? t.tunnelServerPort : t.tunnelLocalPort}>
            <Input type="number" min={1} max={65535} value={bindPort} onChange={(event) => setBindPort(event.target.value)} placeholder="15432" className="font-mono" />
          </Field>
        </div>

        {kind !== "dynamic" && (
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field label={t.tunnelTargetHost}>
              <Input value={targetHost} onChange={(event) => setTargetHost(event.target.value)} placeholder="127.0.0.1" className="font-mono" />
            </Field>
            <Field label={t.tunnelTargetPort}>
              <Input type="number" min={1} max={65535} value={targetPort} onChange={(event) => setTargetPort(event.target.value)} placeholder="5432" className="font-mono" />
            </Field>
          </div>
        )}

        {input.bindPort > 0 && (
          <p className="rounded-sm bg-fill-1 px-3 py-2 font-mono text-caption font-normal text-label-2">
            {describeTunnel(input)}
          </p>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2 text-callout text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>
              {t.saveFailed}: {error}
            </span>
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="primary">
            {t.save}
          </Button>
        </div>
    </Overlay>
  );
}

function Field({
  label,
  hint,
  group = false,
  children,
}: {
  label: string;
  hint?: string;
  group?: boolean;
  children: ReactNode;
}) {
  const Element = group ? "div" : "label";
  return (
    <Element className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-caption text-label-2">
        {label}
        {hint && <span className="font-normal text-label-3">{hint}</span>}
      </span>
      {children}
    </Element>
  );
}
