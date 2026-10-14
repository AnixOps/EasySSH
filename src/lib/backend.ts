import { Channel, invoke } from "@tauri-apps/api/core";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { previewCancel, previewFiles, previewTransfer } from "./previewFiles";
import { previewSnapshot } from "./preview";
import { previewSession } from "./previewSession";

export type HostSource = "saved" | "ssh_config";

export interface Host {
  id: string;
  name: string;
  target: string;
  command: string;
  groupId: string | null;
  tags: string[];
  favorite: boolean;
  color: string | null;
  source: HostSource;
}

export interface Group {
  id: string;
  name: string;
  color: string | null;
}

export interface HostsSnapshot {
  hosts: Host[];
  groups: Group[];
  warnings: string[];
}

export type SessionEvent = { kind: "data"; data: string } | { kind: "exit"; code: number | null };

export interface SessionHandle {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

/** False in a plain browser (vite dev, CI screenshots): use preview data. */
export const isTauri = "__TAURI_INTERNALS__" in window;

export async function loadHosts(): Promise<HostsSnapshot> {
  if (!isTauri) return previewSnapshot();
  return invoke<HostsSnapshot>("load_hosts");
}

export async function openExternal(hostId: string): Promise<void> {
  if (!isTauri) return;
  await invoke("open_external", { hostId });
}

/** Starts `ssh` for `hostId` (or a local shell when null) in a PTY. */
export async function openSession(
  hostId: string | null,
  cols: number,
  rows: number,
  onEvent: (event: SessionEvent) => void,
): Promise<SessionHandle> {
  if (!isTauri) return previewSession(hostId, onEvent);
  const events = new Channel<SessionEvent>();
  events.onmessage = onEvent;
  const id = await invoke<string>("session_open", { hostId, cols, rows, events });
  const report = (reason: unknown) => console.error(reason);
  return {
    write: (data) => void invoke("session_write", { id, data }).catch(report),
    resize: (cols, rows) => void invoke("session_resize", { id, cols, rows }).catch(report),
    close: () => void invoke("session_close", { id }).catch(report),
  };
}

export async function copyText(text: string): Promise<void> {
  if (isTauri) await writeText(text);
  else await navigator.clipboard.writeText(text);
}

export async function pasteText(): Promise<string> {
  if (isTauri) return (await readText()) ?? "";
  return navigator.clipboard.readText();
}

export type RemoteFileKind = "directory" | "file" | "symlink" | "other";

export interface RemoteFile {
  name: string;
  kind: RemoteFileKind;
  size: number;
  modified: string;
  permissions: string;
}

export interface FilesHandle {
  home: string;
  list(path: string): Promise<RemoteFile[]>;
  mkdir(path: string): Promise<void>;
  remove(path: string, directory: boolean): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  close(): void;
}

export type TransferEvent =
  | { kind: "progress"; bytes: number }
  | { kind: "done" }
  | { kind: "failed"; message: string }
  | { kind: "cancelled" };

export interface TransferRequest {
  hostId: string;
  upload: boolean;
  /** Upload: the remote directory. Download: the remote path. */
  remote: string;
  /** Upload only: the local file or folder. */
  local?: string;
}

export interface StartedTransfer {
  id: string;
  local: string;
  remote: string;
}

/** Opens a long-lived sftp process for browsing `hostId`. */
export async function openFiles(hostId: string): Promise<FilesHandle> {
  if (!isTauri) return previewFiles();
  const { id, home } = await invoke<{ id: string; home: string }>("sftp_open", { hostId });
  return {
    home,
    list: (path) => invoke<RemoteFile[]>("sftp_list", { id, path }),
    mkdir: (path) => invoke("sftp_mkdir", { id, path }),
    remove: (path, directory) => invoke("sftp_remove", { id, path, directory }),
    rename: (from, to) => invoke("sftp_rename", { id, from, to }),
    close: () => void invoke("sftp_close", { id }).catch(console.error),
  };
}

export async function startTransfer(
  request: TransferRequest,
  onEvent: (event: TransferEvent) => void,
): Promise<StartedTransfer> {
  if (!isTauri) return previewTransfer(request, onEvent);
  const events = new Channel<TransferEvent>();
  events.onmessage = onEvent;
  return invoke<StartedTransfer>("transfer_start", { ...request, local: request.local ?? null, events });
}

export async function cancelTransfer(id: string): Promise<void> {
  if (!isTauri) return previewCancel(id);
  await invoke("transfer_cancel", { id });
}

export async function pickUploads(): Promise<string[]> {
  if (!isTauri) return ["/Users/you/Desktop/release-notes.md"];
  const picked = await openDialog({ multiple: true, directory: false });
  if (picked === null) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function revealLocal(path: string): Promise<void> {
  if (isTauri) await revealItemInDir(path);
}
