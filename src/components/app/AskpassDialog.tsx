import { KeyRound, ShieldQuestion } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onAskpass, replyAskpass, type AskpassPrompt } from "@/lib/backend";
import { t } from "@/lib/i18n";

/** Answers OpenSSH prompts from processes without a terminal (the file pane
 *  and transfers). The answer goes straight back to OpenSSH; nothing is kept. */
export function AskpassDialog() {
  const [queue, setQueue] = useState<AskpassPrompt[]>([]);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const current = queue[0];

  useEffect(() => onAskpass((prompt) => setQueue((items) => [...items, prompt])), []);

  useEffect(() => {
    setValue("");
    if (current) window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [current]);

  if (!current) return null;

  const answer = (reply: string | null) => {
    replyAskpass(current.id, reply);
    setValue("");
    setQueue((items) => items.slice(1));
  };

  const Icon = current.confirm ? ShieldQuestion : KeyRound;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-(--shadow-color) p-6 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="askpass-title"
        onSubmit={(event) => {
          event.preventDefault();
          answer(current.confirm ? "yes" : value);
        }}
        onKeyDown={(event) => event.key === "Escape" && answer(null)}
        className="w-full max-w-md animate-page-in rounded-lg bg-bg-elevated p-6 shadow-3"
      >
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-6 shrink-0 text-(--accent)" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <h2 id="askpass-title" className="text-title-3">
              {current.confirm ? t.askpassConfirmTitle : t.askpassTitle} {current.host}
            </h2>
            <p className="selectable mt-2 text-callout break-words whitespace-pre-wrap text-label-2">
              {current.prompt.trim()}
            </p>
          </div>
        </div>
        {!current.confirm && (
          <>
            <Input
              ref={inputRef}
              type="password"
              autoComplete="off"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-label={current.prompt}
              className="mt-5"
            />
            <p className="mt-2 text-caption font-normal text-label-3">{t.askpassNotSaved}</p>
          </>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => answer(null)}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="primary">
            {current.confirm ? t.askpassTrust : t.askpassSubmit}
          </Button>
        </div>
      </form>
    </div>
  );
}
