import { KeyRound, ShieldQuestion } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Overlay } from "@/components/ui/overlay";
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

  const answer = (prompt: AskpassPrompt, reply: string | null) => {
    replyAskpass(prompt.id, reply);
    setValue("");
    setQueue((items) => items.slice(1));
  };

  return (
    <AnimatePresence>
      {current && (
        <Overlay
          key={current.id}
          labelledBy="askpass-title"
          onDismiss={() => answer(current, null)}
          onSubmit={() => answer(current, current.confirm ? "yes" : value)}
          className="max-w-md p-6"
        >
          <div className="flex items-start gap-3">
            {current.confirm ? (
              <ShieldQuestion className="mt-0.5 size-6 shrink-0 text-(--accent)" strokeWidth={1.5} />
            ) : (
              <KeyRound className="mt-0.5 size-6 shrink-0 text-(--accent)" strokeWidth={1.5} />
            )}
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
            <Button type="button" variant="secondary" onClick={() => answer(current, null)}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {current.confirm ? t.askpassTrust : t.askpassSubmit}
            </Button>
          </div>
        </Overlay>
      )}
    </AnimatePresence>
  );
}
