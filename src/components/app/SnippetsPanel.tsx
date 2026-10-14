import { ClipboardPaste, CornerDownLeft, Pencil, Plus, Radio, SquareCode, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { deleteSnippet, loadSnippets, saveSnippet, type Snippet } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { connectedTerminals, terminalFor } from "@/lib/terminals";
import { cn } from "@/lib/utils";

type Draft = { id: string | null; name: string; content: string };

/** Saved commands. Click to run in the active terminal, or broadcast to
 *  every connected terminal. */
export function SnippetsPanel({ activeKey }: { activeKey: string | null }) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadSnippets()
      .then(setSnippets)
      .catch((reason) => setError(String(reason)));
  }, []);
  useEffect(reload, [reload]);

  const send = (snippet: Snippet, run: boolean) => {
    const targets = broadcast ? connectedTerminals() : [terminalFor(activeKey)].filter((target) => target !== undefined);
    if (targets.length === 0) {
      setError(t.noTerminal);
      return;
    }
    setError(null);
    for (const target of targets) target.send(snippet.content, run);
  };

  const save = async () => {
    if (!draft) return;
    try {
      await saveSnippet(draft.id, draft.name, draft.content);
      setDraft(null);
      setError(null);
      reload();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const remove = async (id: string) => {
    setConfirming(null);
    try {
      await deleteSnippet(id);
      reload();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const normalized = query.trim().toLowerCase();
  const visible = snippets.filter(
    (snippet) =>
      snippet.name.toLowerCase().includes(normalized) || snippet.content.toLowerCase().includes(normalized),
  );

  return (
    <aside className="material-sidebar flex w-72 shrink-0 flex-col border-r">
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchSnippets}
          aria-label={t.searchSnippets}
          className="min-w-0 flex-1"
        />
        <Tooltip label={t.newSnippet}>
          <Button
            variant="secondary"
            size="icon"
            aria-label={t.newSnippet}
            onClick={() => setDraft({ id: null, name: "", content: "" })}
          >
            <Plus />
          </Button>
        </Tooltip>
      </div>

      {error && <p className="mx-3 mb-2 rounded-sm bg-danger-soft px-3 py-2 text-caption font-normal text-danger">{error}</p>}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {draft && <DraftEditor draft={draft} onChange={setDraft} onSave={() => void save()} onCancel={() => setDraft(null)} />}
        {snippets.length === 0 && !draft && (
          <div className="px-3 pt-10 text-center">
            <SquareCode className="mx-auto mb-3 size-12 text-label-3" strokeWidth={1.5} />
            <p className="text-callout font-semibold text-label-1">{t.noSnippets}</p>
            <p className="mt-1 text-caption font-normal text-label-2">{t.noSnippetsHint}</p>
          </div>
        )}
        {visible.map((snippet) =>
          draft?.id === snippet.id ? null : (
            <div key={snippet.id} className="group relative rounded-sm px-2 py-2 hover:bg-fill-1">
              <button
                type="button"
                onClick={() => send(snippet, true)}
                className="block w-full pr-14 text-left"
                aria-label={`${t.runSnippet}: ${snippet.name}`}
              >
                <span className="block truncate text-callout font-medium text-label-1">{snippet.name}</span>
                <code className="mt-0.5 line-clamp-2 font-mono text-caption font-normal break-words text-label-2">
                  {snippet.content}
                </code>
              </button>
              {confirming === snippet.id ? (
                <div className="mt-2 flex gap-1">
                  <Button variant="destructive" size="sm" className="h-6 px-2" onClick={() => void remove(snippet.id)}>
                    {t.confirmDelete}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setConfirming(null)}>
                    {t.cancel}
                  </Button>
                </div>
              ) : (
                <span className="absolute top-1.5 right-1.5 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <SmallButton label={t.pasteSnippet} onClick={() => send(snippet, false)}>
                    <ClipboardPaste />
                  </SmallButton>
                  <SmallButton label={t.edit} onClick={() => setDraft({ ...snippet })}>
                    <Pencil />
                  </SmallButton>
                  <SmallButton label={t.delete} onClick={() => setConfirming(snippet.id)}>
                    <Trash2 />
                  </SmallButton>
                </span>
              )}
            </div>
          ),
        )}
      </div>

      <div className="border-t px-3 py-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={broadcast}
          onClick={() => setBroadcast(!broadcast)}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-callout transition-colors duration-micro",
            broadcast ? "bg-accent-soft text-(--accent)" : "text-label-2 hover:bg-fill-1 hover:text-label-1",
          )}
        >
          <Radio className="size-4" strokeWidth={1.5} />
          <span className="flex-1 text-left">{t.broadcast}</span>
          <span className="text-caption font-normal">{broadcast ? t.on : t.off}</span>
        </button>
        <p className="mt-1.5 flex items-center gap-1 px-2 text-caption font-normal text-label-3">
          <CornerDownLeft className="size-3.5" strokeWidth={1.5} />
          {t.snippetHint}
        </p>
      </div>
    </aside>
  );
}

function DraftEditor({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="space-y-2 rounded-sm bg-bg-elevated p-2 shadow-1 ring-1 ring-separator"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      onKeyDown={(event) => event.key === "Escape" && onCancel()}
    >
      <Input
        autoFocus
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        placeholder={t.snippetName}
        aria-label={t.snippetName}
        className="h-8"
      />
      <textarea
        value={draft.content}
        onChange={(event) => onChange({ ...draft, content: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) onSave();
        }}
        placeholder="df -h"
        aria-label={t.snippetCommand}
        rows={4}
        spellCheck={false}
        className="w-full resize-y rounded-sm bg-fill-1 px-3 py-2 font-mono text-caption font-normal text-label-1 outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button type="submit" variant="primary" size="sm">
          {t.save}
        </Button>
      </div>
    </form>
  );
}

function SmallButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
        {children}
      </Button>
    </Tooltip>
  );
}
