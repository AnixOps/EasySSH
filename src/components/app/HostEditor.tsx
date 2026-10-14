import { CircleAlert, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Overlay } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/segmented";
import { deleteHost, hostColor, saveHost, type Group, type Host, type HostFields } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-7", "chart-8"];

const emptyFields: HostFields = { alias: null, hostname: "", username: null, port: 22, proxyJump: null, notes: "" };

/** Create or edit a host. `host` is null for a new one. */
export function HostEditor({
  host,
  groups,
  onDone,
  onCancel,
}: {
  host: Host | null;
  groups: Group[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const saved = host?.source === "saved";
  const [name, setName] = useState(host?.name ?? "");
  const [byAlias, setByAlias] = useState(Boolean(host?.fields.alias));
  const [fields, setFields] = useState<HostFields>(host?.fields ?? emptyFields);
  const [group, setGroup] = useState(groups.find((candidate) => candidate.id === host?.groupId)?.name ?? "");
  const [tags, setTags] = useState(host?.tags.join(", ") ?? "");
  const [color, setColor] = useState<string | null>(host?.color ?? null);
  const [favorite, setFavorite] = useState(host?.favorite ?? false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => firstRef.current?.focus(), []);

  const set = <K extends keyof HostFields>(key: K, value: HostFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveHost({
        id: host?.id ?? null,
        name: name.trim() || (byAlias ? fields.alias ?? "" : fields.hostname),
        group: group.trim() || null,
        tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
        favorite,
        color,
        fields: byAlias
          ? { ...fields, alias: fields.alias?.trim() || null }
          : { ...fields, alias: null, port: Number(fields.port) || 22 },
      });
      onDone();
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!host) return;
    setBusy(true);
    try {
      await deleteHost(host.id);
      onDone();
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
    }
  };

  const title = !host ? t.newHost : saved ? t.editHost : t.saveToHosts;

  return (
    <Overlay
      labelledBy="host-editor-title"
      onDismiss={onCancel}
      onSubmit={() => void submit()}
      className="flex max-h-full max-w-lg flex-col"
    >
        <h2 id="host-editor-title" className="px-6 pt-6 text-title-3">
          {title}
        </h2>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pt-5 pb-2">
          <Field label={t.hostName}>
            <Input ref={firstRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="prod-web-01" />
          </Field>

          <Field label={t.connectBy} group>
            <Segmented
              value={byAlias}
              onChange={setByAlias}
              label={t.connectBy}
              options={[
                { value: false, label: t.byAddress },
                { value: true, label: t.byAlias },
              ]}
            />
          </Field>

          {byAlias ? (
            <Field label={t.alias}>
              <Input
                value={fields.alias ?? ""}
                onChange={(event) => set("alias", event.target.value)}
                placeholder="bastion"
                className="font-mono"
                spellCheck={false}
              />
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label={t.hostname}>
                  <Input
                    value={fields.hostname}
                    onChange={(event) => set("hostname", event.target.value)}
                    placeholder="10.0.1.11"
                    className="font-mono"
                    spellCheck={false}
                  />
                </Field>
                <Field label={t.port}>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={fields.port}
                    onChange={(event) => set("port", Number(event.target.value))}
                    className="font-mono"
                  />
                </Field>
              </div>
              <Field label={t.username} hint={t.optional}>
                <Input
                  value={fields.username ?? ""}
                  onChange={(event) => set("username", event.target.value || null)}
                  placeholder="deploy"
                  className="font-mono"
                  spellCheck={false}
                />
              </Field>
            </>
          )}

          <Field label={t.proxyJump} hint={t.optional}>
            <Input
              value={fields.proxyJump ?? ""}
              onChange={(event) => set("proxyJump", event.target.value || null)}
              placeholder="bastion"
              className="font-mono"
              spellCheck={false}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.group} hint={t.optional}>
              <Input value={group} onChange={(event) => setGroup(event.target.value)} list="host-editor-groups" />
              <datalist id="host-editor-groups">
                {groups.map((candidate) => (
                  <option key={candidate.id} value={candidate.name} />
                ))}
              </datalist>
            </Field>
            <Field label={t.tags} hint={t.tagsHint}>
              <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="web, nginx" />
            </Field>
          </div>

          <Field label={t.color} group>
            <div className="flex items-center gap-2">
              <Swatch selected={color === null} label={t.noColor} onClick={() => setColor(null)} />
              {COLORS.map((token) => (
                <Swatch key={token} color={token} selected={color === token} label={token} onClick={() => setColor(token)} />
              ))}
              <button
                type="button"
                role="switch"
                aria-checked={favorite}
                onClick={() => setFavorite(!favorite)}
                className={cn(
                  "ml-auto flex h-7 items-center gap-1.5 rounded-pill px-3 text-callout transition-colors duration-micro",
                  favorite ? "bg-accent-soft text-(--accent)" : "bg-fill-1 text-label-2 hover:text-label-1",
                )}
              >
                <Star className={cn("size-4", favorite && "fill-current")} strokeWidth={1.5} />
                {t.favorite}
              </button>
            </div>
          </Field>

          <Field label={t.notes} hint={t.optional}>
            <textarea
              value={fields.notes}
              onChange={(event) => set("notes", event.target.value)}
              rows={3}
              className="w-full resize-none rounded-sm bg-fill-1 px-3 py-2 text-callout text-label-1 outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            />
          </Field>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2 text-callout text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>
                {t.saveFailed}: {error}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 pt-4 pb-6">
          {saved &&
            (confirmDelete ? (
              <Button type="button" variant="destructive" onClick={() => void remove()} disabled={busy}>
                <Trash2 />
                {t.confirmDelete}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 />
                {t.delete}
              </Button>
            ))}
          <div className="flex-1" />
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {t.save}
          </Button>
        </div>
    </Overlay>
  );
}

/** A labelled form row; `group` renders a div for button groups, which a
 *  label element would otherwise click when its text is clicked. */
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

function Swatch({
  color,
  selected,
  label,
  onClick,
}: {
  color?: string;
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-(--bg-elevated) transition-shadow duration-micro",
        selected ? "ring-2 ring-(--accent)" : "ring-1 ring-separator",
        !color && "bg-fill-1",
      )}
      style={color ? { backgroundColor: hostColor(color) } : undefined}
    />
  );
}
