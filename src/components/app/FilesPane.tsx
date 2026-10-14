import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  Download,
  File,
  Folder,
  FolderPlus,
  FolderSearch,
  FolderUp,
  Link2,
  LoaderCircle,
  Pencil,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import {
  cancelTransfer,
  isTauri,
  openFiles,
  pickUploads,
  revealLocal,
  startTransfer,
  type FilesHandle,
  type RemoteFile,
  type TransferEvent,
} from "@/lib/backend";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface TransferItem {
  id: string;
  name: string;
  upload: boolean;
  local: string;
  state: "running" | "done" | "failed" | "cancelled";
  bytes: number;
  total: number | null;
  message?: string;
}

type Editing = { kind: "mkdir"; value: string } | { kind: "rename"; from: string; value: string };

const joinPath = (dir: string, name: string) => (dir.endsWith("/") ? dir + name : `${dir}/${name}`);
const parentPath = (path: string) => path.replace(/\/[^/]+\/?$/, "") || "/";
const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function sortEntries(entries: RemoteFile[]): RemoteFile[] {
  return [...entries].sort((a, b) => {
    const aDir = a.kind === "directory" ? 0 : 1;
    const bDir = b.kind === "directory" ? 0 : 1;
    return aDir - bDir || a.name.localeCompare(b.name);
  });
}

export function FilesPane({
  hostId,
  visible,
  active,
  onClose,
}: {
  hostId: string;
  visible: boolean;
  active: boolean;
  onClose: () => void;
}) {
  const [handle, setHandle] = useState<FilesHandle | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [cwd, setCwd] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [entries, setEntries] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const paneRef = useRef<HTMLElement>(null);
  const cwdRef = useRef("");

  const navigate = useCallback(
    async (files: FilesHandle, path: string) => {
      setLoading(true);
      setActionError(null);
      try {
        const listing = await files.list(path);
        setEntries(sortEntries(listing));
        setCwd(path);
        setPathInput(path);
        cwdRef.current = path;
        setSelected(null);
        setEditing(null);
        setConfirming(null);
      } catch (reason) {
        setActionError(String(reason));
        setPathInput(cwdRef.current);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let opened: FilesHandle | null = null;
    setConnectError(null);
    setHandle(null);
    openFiles(hostId)
      .then((files) => {
        if (disposed) return files.close();
        opened = files;
        setHandle(files);
        void navigate(files, files.home);
      })
      .catch((reason) => !disposed && setConnectError(String(reason)));
    return () => {
      disposed = true;
      opened?.close();
    };
  }, [hostId, attempt, navigate]);

  const run = async (action: () => Promise<void>) => {
    if (!handle) return;
    try {
      await action();
      await navigate(handle, cwd);
    } catch (reason) {
      setActionError(String(reason));
    }
  };

  const updateTransfer = useCallback((id: string, patch: Partial<TransferItem>) => {
    setTransfers((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const transfer = useCallback(
    async (upload: boolean, remote: string, local: string | undefined, total: number | null) => {
      const targetDir = cwdRef.current;
      let id = "";
      // Events can arrive before the start call returns; hold them until the item exists.
      let ready = false;
      const early: TransferEvent[] = [];
      const onEvent = (event: TransferEvent) => (ready ? apply(event) : early.push(event));
      const apply = (event: TransferEvent) => {
        if (event.kind === "progress") updateTransfer(id, { bytes: event.bytes });
        else if (event.kind === "done") {
          updateTransfer(id, { state: "done", bytes: total ?? 0 });
          if (upload && handle && cwdRef.current === targetDir) void navigate(handle, targetDir);
        } else if (event.kind === "failed") updateTransfer(id, { state: "failed", message: event.message });
        else updateTransfer(id, { state: "cancelled" });
      };
      try {
        const started = await startTransfer({ hostId, upload, remote, local }, onEvent);
        id = started.id;
        setTransfers((current) => [
          {
            id,
            name: baseName(upload ? started.local : started.remote),
            upload,
            local: started.local,
            state: "running",
            bytes: 0,
            total,
          },
          ...current,
        ]);
        ready = true;
        early.forEach(apply);
      } catch (reason) {
        setActionError(String(reason));
      }
    },
    [handle, hostId, navigate, updateTransfer],
  );

  const uploadPaths = useCallback(
    (paths: string[]) => {
      for (const path of paths) void transfer(true, cwdRef.current, path, null);
    },
    [transfer],
  );

  // Files dropped from the system onto the pane are uploaded to the current folder.
  useEffect(() => {
    if (!isTauri || !active || !handle) return;
    const inside = (x: number, y: number) => {
      const rect = paneRef.current?.getBoundingClientRect();
      if (!rect) return false;
      const scale = window.devicePixelRatio;
      return x >= rect.left * scale && x <= rect.right * scale && y >= rect.top * scale && y <= rect.bottom * scale;
    };
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "over") setDragOver(inside(payload.position.x, payload.position.y));
      else if (payload.type === "drop") {
        setDragOver(false);
        if (inside(payload.position.x, payload.position.y)) uploadPaths(payload.paths);
      } else setDragOver(false);
    });
    return () => void unlisten.then((stop) => stop());
  }, [active, handle, uploadPaths]);

  const open = (entry: RemoteFile) => {
    if (!handle) return;
    if (entry.kind === "directory" || entry.kind === "symlink") void navigate(handle, joinPath(cwd, entry.name));
    else void transfer(false, joinPath(cwd, entry.name), undefined, entry.size);
  };

  const submitEdit = () => {
    if (!editing || !handle) return;
    const value = editing.value.trim();
    if (!value || value.includes("/")) return;
    if (editing.kind === "mkdir") void run(() => handle.mkdir(joinPath(cwd, value)));
    else if (value !== editing.from) void run(() => handle.rename(joinPath(cwd, editing.from), joinPath(cwd, value)));
    setEditing(null);
  };

  if (connectError) {
    return (
      <PaneFrame paneRef={paneRef} visible={visible} onClose={onClose}>
        <div className="flex flex-1 flex-col items-center px-6 pt-16 text-center">
          <CircleAlert className="mb-3 size-12 text-label-3" strokeWidth={1.5} />
          <p className="text-callout font-semibold text-label-1">{t.filesFailed}</p>
          <p className="selectable mt-2 text-caption font-normal break-all text-label-2">{connectError}</p>
          <p className="mt-3 text-caption font-normal text-label-2">{t.filesAuthHint}</p>
          <Button variant="secondary" size="sm" className="mt-5" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCw />
            {t.retry}
          </Button>
        </div>
      </PaneFrame>
    );
  }

  if (!handle) {
    return (
      <PaneFrame paneRef={paneRef} visible={visible} onClose={onClose}>
        <div className="flex flex-1 items-center justify-center gap-2 text-callout text-label-2">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
          {t.filesConnecting}
        </div>
      </PaneFrame>
    );
  }

  const finished = transfers.some((item) => item.state !== "running");

  return (
    <PaneFrame
      paneRef={paneRef}
      visible={visible}
      onClose={onClose}
      actions={
        <>
          <IconButton label={t.parentFolder} onClick={() => void navigate(handle, parentPath(cwd))} disabled={cwd === "/"}>
            <FolderUp />
          </IconButton>
          <IconButton label={t.refresh} onClick={() => void navigate(handle, cwd)}>
            <RotateCw />
          </IconButton>
          <IconButton label={t.newFolder} onClick={() => setEditing({ kind: "mkdir", value: "" })}>
            <FolderPlus />
          </IconButton>
          <IconButton label={t.upload} onClick={() => void pickUploads().then(uploadPaths)}>
            <Upload />
          </IconButton>
        </>
      }
    >
      <div className="px-3 pt-2 pb-2">
        <Input
          value={pathInput}
          onChange={(event) => setPathInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && pathInput.trim()) void navigate(handle, pathInput.trim());
            if (event.key === "Escape") setPathInput(cwd);
          }}
          aria-label={t.path}
          spellCheck={false}
          className="h-8 font-mono text-caption font-normal"
        />
      </div>

      {actionError && (
        <p role="alert" className="mx-3 mb-2 flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2 text-caption font-normal text-danger">
          <CircleAlert className="mt-px size-4 shrink-0" strokeWidth={1.5} />
          <span className="selectable min-w-0 flex-1 break-all">{actionError}</span>
          <button type="button" aria-label={t.cancel} onClick={() => setActionError(null)} className="shrink-0">
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </p>
      )}

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto px-2 pb-2 transition-opacity duration-micro",
          loading && "opacity-60",
        )}
        role="listbox"
        aria-label={cwd}
      >
        {editing?.kind === "mkdir" && (
          <EditRow
            icon={<Folder />}
            value={editing.value}
            placeholder={t.folderName}
            onChange={(value) => setEditing({ ...editing, value })}
            onSubmit={submitEdit}
            onCancel={() => setEditing(null)}
          />
        )}
        {entries.length === 0 && !loading && !editing && (
          <p className="pt-10 text-center text-callout text-label-2">{t.emptyFolder}</p>
        )}
        {entries.map((entry) =>
          editing?.kind === "rename" && editing.from === entry.name ? (
            <EditRow
              key={entry.name}
              icon={<EntryIcon entry={entry} />}
              value={editing.value}
              onChange={(value) => setEditing({ ...editing, value })}
              onSubmit={submitEdit}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <EntryRow
              key={entry.name}
              entry={entry}
              selected={selected === entry.name}
              confirming={confirming === entry.name}
              onSelect={() => setSelected(entry.name)}
              onOpen={() => open(entry)}
              onDownload={() => void transfer(false, joinPath(cwd, entry.name), undefined, entry.kind === "file" ? entry.size : null)}
              onRename={() => setEditing({ kind: "rename", from: entry.name, value: entry.name })}
              onDelete={() => setConfirming(entry.name)}
              onConfirmDelete={() => {
                setConfirming(null);
                void run(() => handle.remove(joinPath(cwd, entry.name), entry.kind === "directory"));
              }}
              onCancelDelete={() => setConfirming(null)}
            />
          ),
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-md bg-accent-soft ring-2 ring-(--accent)">
            <p className="flex items-center gap-2 text-callout font-medium text-(--accent)">
              <Upload className="size-4" strokeWidth={1.5} />
              {t.dropToUpload} {cwd}
            </p>
          </div>
        )}
      </div>

      {transfers.length > 0 && (
        <section className="max-h-56 shrink-0 overflow-y-auto border-t px-2 pt-2 pb-3">
          <div className="flex items-center px-2 pb-1">
            <h3 className="text-caption text-label-2">{t.transfers}</h3>
            {finished && (
              <button
                type="button"
                className="ml-auto text-caption font-normal text-label-2 hover:text-label-1"
                onClick={() => setTransfers((current) => current.filter((item) => item.state === "running"))}
              >
                {t.clearFinished}
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {transfers.map((item) => (
              <TransferRow key={item.id} item={item} onCancel={() => {
                void cancelTransfer(item.id);
                updateTransfer(item.id, { state: "cancelled" });
              }} />
            ))}
          </ul>
        </section>
      )}
    </PaneFrame>
  );
}

function PaneFrame({
  paneRef,
  visible,
  onClose,
  actions,
  children,
}: {
  paneRef: RefObject<HTMLElement | null>;
  visible: boolean;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside ref={paneRef} hidden={!visible} aria-label={t.files} className="material-sidebar flex w-[400px] shrink-0 animate-page-in flex-col border-l">
      <div className="flex h-11 shrink-0 items-center gap-0.5 border-b pr-2 pl-4">
        <h2 className="mr-auto text-callout font-semibold">{t.files}</h2>
        {actions}
        <IconButton label={t.closeFiles} onClick={onClose}>
          <X />
        </IconButton>
      </div>
      {children}
    </aside>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>
        {children}
      </Button>
    </Tooltip>
  );
}

function EntryIcon({ entry }: { entry: RemoteFile }) {
  const Icon = entry.kind === "directory" ? Folder : entry.kind === "symlink" ? Link2 : File;
  return <Icon className={cn("size-4 shrink-0", entry.kind === "directory" ? "text-(--accent)" : "text-label-2")} strokeWidth={1.5} />;
}

function EntryRow({
  entry,
  selected,
  confirming,
  onSelect,
  onOpen,
  onDownload,
  onRename,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  entry: RemoteFile;
  selected: boolean;
  confirming: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
        if (event.key === "Delete") onDelete();
      }}
      className={cn(
        "group relative flex h-8 items-center gap-2 rounded-xs px-2 text-callout transition-colors duration-micro",
        selected ? "bg-accent-soft" : "hover:bg-fill-1",
      )}
    >
      <EntryIcon entry={entry} />
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <Button variant="destructive" size="sm" className="h-6 px-2" onClick={onConfirmDelete}>
            {t.confirmDelete}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onCancelDelete}>
            {t.cancel}
          </Button>
        </span>
      ) : (
        <>
          <span className="w-16 shrink-0 text-right text-caption font-normal text-label-3 group-hover:invisible">
            {entry.kind === "directory" ? "" : formatSize(entry.size)}
          </span>
          <span className="w-24 shrink-0 truncate text-right text-caption font-normal text-label-3 group-hover:invisible">
            {entry.modified}
          </span>
          <span className="invisible absolute right-1 flex items-center gap-0.5 group-hover:visible group-focus-within:visible">
            <IconButton label={t.download} onClick={onDownload}>
              <Download />
            </IconButton>
            <IconButton label={t.rename} onClick={onRename}>
              <Pencil />
            </IconButton>
            <IconButton label={t.delete} onClick={onDelete}>
              <Trash2 />
            </IconButton>
          </span>
        </>
      )}
    </div>
  );
}

function EditRow({
  icon,
  value,
  placeholder,
  onChange,
  onSubmit,
  onCancel,
}: {
  icon: ReactNode;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex h-8 items-center gap-2 px-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-label-2">
      {icon}
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
          if (event.key === "Escape") onCancel();
        }}
        onBlur={onCancel}
        className="h-7 text-callout"
      />
    </div>
  );
}

function TransferRow({ item, onCancel }: { item: TransferItem; onCancel: () => void }) {
  const progress = item.total ? Math.min(1, item.bytes / item.total) : null;
  const Direction = item.upload ? ArrowUp : ArrowDown;
  return (
    <li className="rounded-xs px-2 py-1.5">
      <div className="flex items-center gap-2 text-callout">
        <Direction className="size-4 shrink-0 text-label-2" strokeWidth={1.5} aria-label={item.upload ? t.upload : t.download} />
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        <TransferStatus item={item} />
        {item.state === "running" && (
          <IconButton label={t.cancelTransfer} onClick={onCancel}>
            <X />
          </IconButton>
        )}
        {item.state === "done" && !item.upload && isTauri && (
          <IconButton label={t.showInFolder} onClick={() => void revealLocal(item.local)}>
            <FolderSearch />
          </IconButton>
        )}
      </div>
      {item.state === "running" && progress !== null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-fill-2">
          <div
            className="h-full origin-left rounded-pill bg-accent-fill transition-transform duration-overlay ease-standard"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      )}
      {item.state === "failed" && item.message && (
        <p className="selectable mt-1 text-caption font-normal break-all text-danger">{item.message}</p>
      )}
    </li>
  );
}

function TransferStatus({ item }: { item: TransferItem }) {
  const text = "shrink-0 text-caption font-normal";
  if (item.state === "running") {
    return (
      <span className={cn(text, "flex items-center gap-1 text-label-2")}>
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
        {item.bytes > 0 ? formatSize(item.bytes) : ""}
      </span>
    );
  }
  if (item.state === "done") {
    return (
      <span className={cn(text, "flex items-center gap-1 text-success")}>
        <Check className="size-3.5" strokeWidth={1.5} />
        {t.transferDone}
      </span>
    );
  }
  if (item.state === "failed") {
    return (
      <span className={cn(text, "flex items-center gap-1 text-danger")}>
        <CircleAlert className="size-3.5" strokeWidth={1.5} />
        {t.transferFailed}
      </span>
    );
  }
  return <span className={cn(text, "text-label-3")}>{t.transferCancelled}</span>;
}
