import { CircleAlert, Download, FolderOpen, GitBranch, LoaderCircle, Upload } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  exportConfig,
  importConfig,
  loadSync,
  pickFolder,
  setupSync,
  syncPull,
  syncPush,
  type SyncState,
} from "@/lib/backend";
import { t } from "@/lib/i18n";

type Busy = "export" | "import" | "push" | "pull" | "setup" | null;

/** Export, import and Git sync; `onChanged` reloads hosts after an import or pull. */
export function BackupSync({ onChanged }: { onChanged: () => void }) {
  const [sync, setSync] = useState<SyncState | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [form, setForm] = useState<{ path: string; remote: string; branch: string } | null>(null);
  const [confirmPull, setConfirmPull] = useState(false);

  const reload = useCallback(() => {
    loadSync().then(setSync).catch((reason) => setMessage({ text: String(reason), error: true }));
  }, []);
  useEffect(reload, [reload]);

  const run = async (kind: Busy, action: () => Promise<string | null>) => {
    setBusy(kind);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ text, error: false });
    } catch (reason) {
      setMessage({ text: String(reason), error: true });
    } finally {
      setBusy(null);
      reload();
    }
  };

  const doImport = () =>
    run("import", async () => {
      const summary = await importConfig();
      if (!summary) return null;
      onChanged();
      const parts = [
        `${summary.hosts} ${t.hostsCount}`,
        `${summary.snippets} ${t.navSnippets}`,
        `${summary.tunnels} ${t.tunnelsCount}`,
      ];
      return `${t.imported}: ${parts.join(" · ")}${summary.skipped ? ` · ${t.skipped} ${summary.skipped}` : ""}`;
    });

  const doPull = () =>
    run("pull", async () => {
      setConfirmPull(false);
      const changed = await syncPull();
      onChanged();
      return changed ? t.pulled : t.pullEmpty;
    });

  const lastSync = sync?.lastSuccessAt ? new Date(sync.lastSuccessAt).toLocaleString() : t.never;

  return (
    <>
      <Row label={t.backup}>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => run("export", async () => ((await exportConfig()) ? t.exported : null))}
          >
            {busy === "export" ? <Spinner /> : <Upload />}
            {t.exportConfig}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy !== null} onClick={doImport}>
            {busy === "import" ? <Spinner /> : <Download />}
            {t.importConfig}
          </Button>
        </div>
      </Row>

      {form ? (
        <form
          className="space-y-2 px-3 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run("setup", async () => {
              await setupSync(form.path, form.remote.trim() || null, form.branch.trim() || null);
              setForm(null);
              return t.syncReady;
            });
          }}
        >
          <div className="flex gap-1.5">
            <Input
              value={form.path}
              onChange={(event) => setForm({ ...form, path: event.target.value })}
              placeholder={t.syncFolder}
              aria-label={t.syncFolder}
              className="h-8 min-w-0 flex-1 font-mono text-caption font-normal"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-8"
              aria-label={t.chooseFolder}
              onClick={() => void pickFolder().then((path) => path && setForm({ ...form, path }))}
            >
              <FolderOpen />
            </Button>
          </div>
          <Input
            value={form.remote}
            onChange={(event) => setForm({ ...form, remote: event.target.value })}
            placeholder={t.syncRemote}
            aria-label={t.syncRemote}
            className="h-8 font-mono text-caption font-normal"
          />
          <Input
            value={form.branch}
            onChange={(event) => setForm({ ...form, branch: event.target.value })}
            placeholder="main"
            aria-label={t.syncBranch}
            className="h-8 font-mono text-caption font-normal"
          />
          <p className="text-caption font-normal text-label-3">{t.syncHint}</p>
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!form.path.trim() || busy !== null}>
              {busy === "setup" && <Spinner />}
              {t.save}
            </Button>
          </div>
        </form>
      ) : sync?.configured ? (
        <>
          <Row label={t.gitSync}>
            <button
              type="button"
              className="min-w-0 truncate font-mono text-caption font-normal text-label-2 hover:text-label-1"
              title={sync.repositoryPath ?? ""}
              onClick={() =>
                setForm({ path: sync.repositoryPath ?? "", remote: sync.remoteUrl ?? "", branch: sync.branch })
              }
            >
              {sync.repositoryPath}
            </button>
          </Row>
          <Row label={t.lastSync}>
            <span className="text-caption font-normal text-label-2">{lastSync}</span>
          </Row>
          <div className="flex items-center justify-end gap-1.5 px-3 py-2">
            {confirmPull ? (
              <>
                <span className="mr-auto text-caption font-normal text-warning">{t.pullWarning}</span>
                <Button variant="ghost" size="sm" onClick={() => setConfirmPull(false)}>
                  {t.cancel}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void doPull()}>
                  {t.pull}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => setConfirmPull(true)}>
                  {busy === "pull" ? <Spinner /> : <Download />}
                  {t.pull}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    run("push", async () => {
                      await syncPush();
                      return t.pushed;
                    })
                  }
                >
                  {busy === "push" ? <Spinner /> : <Upload />}
                  {t.push}
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <Row label={t.gitSync}>
          <Button variant="secondary" size="sm" onClick={() => setForm({ path: "", remote: "", branch: "main" })}>
            <GitBranch />
            {t.setUp}
          </Button>
        </Row>
      )}

      {(message || sync?.lastError) && (
        <p
          role={message?.error || (!message && sync?.lastError) ? "alert" : "status"}
          className={
            message?.error || (!message && sync?.lastError)
              ? "flex items-start gap-2 px-3 py-2 text-caption font-normal break-words text-danger"
              : "px-3 py-2 text-caption font-normal text-success"
          }
        >
          {(message?.error || (!message && sync?.lastError)) && (
            <CircleAlert className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          )}
          <span className="selectable min-w-0">{message?.text ?? sync?.lastError}</span>
        </p>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3 py-1.5">
      <span className="shrink-0 text-callout text-label-1">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}

function Spinner() {
  return <LoaderCircle className="animate-spin motion-reduce:animate-none" />;
}
