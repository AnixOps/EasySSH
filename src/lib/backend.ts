import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { previewCancel, previewFiles, previewTransfer } from "./previewFiles";
import { previewDeleteHost, previewSaveHost, previewSetFavorite, previewSnapshot } from "./preview";
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
  fields: HostFields;
}

/** Connection settings as the host editor shows and saves them. */
export interface HostFields {
  /** Set for a ~/.ssh/config alias; the endpoint fields are then unused. */
  alias: string | null;
  hostname: string;
  username: string | null;
  port: number;
  proxyJump: string | null;
  notes: string;
}

export interface HostInput {
  /** A saved host's id, a ~/.ssh/config host's id (saved as new), or null. */
  id: string | null;
  name: string;
  group: string | null;
  tags: string[];
  favorite: boolean;
  /** A chart colour token name such as "chart-3", or null. */
  color: string | null;
  fields: HostFields;
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

export async function saveHost(input: HostInput): Promise<string> {
  if (!isTauri) return previewSaveHost(input);
  return invoke<string>("host_save", { input });
}

export async function deleteHost(id: string): Promise<void> {
  if (!isTauri) return previewDeleteHost(id);
  await invoke("host_delete", { id });
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  if (!isTauri) return previewSetFavorite(id, favorite);
  await invoke("host_set_favorite", { id, favorite });
}

/** Host colours are stored as chart token names so they follow the theme;
 *  older configurations may hold a literal colour. */
export function hostColor(color: string | null): string | undefined {
  if (!color) return undefined;
  return color.startsWith("#") ? color : `var(--${color})`;
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

export interface AskpassPrompt {
  id: number;
  host: string;
  prompt: string;
  /** A yes/no question, such as accepting a new host key. */
  confirm: boolean;
}

/** Subscribes to OpenSSH prompts; returns the unsubscribe function. */
export function onAskpass(handler: (prompt: AskpassPrompt) => void): () => void {
  if (!isTauri) {
    if (new URLSearchParams(window.location.search).get("askpass") === "1") {
      window.setTimeout(
        () => handler({ id: 1, host: "prod-db", prompt: "postgres@10.0.2.20's password: ", confirm: false }),
        300,
      );
    }
    return () => {};
  }
  const stop = listen<AskpassPrompt>("askpass", (event) => handler(event.payload));
  return () => void stop.then((unlisten) => unlisten());
}

export function replyAskpass(id: number, answer: string | null): void {
  if (isTauri) void invoke("askpass_reply", { id, answer }).catch(console.error);
}

export interface Snippet {
  id: string;
  name: string;
  content: string;
}

export async function loadSnippets(): Promise<Snippet[]> {
  if (!isTauri) return previewSnippets.map((snippet) => ({ ...snippet }));
  return invoke<Snippet[]>("snippets_list");
}

export async function saveSnippet(id: string | null, name: string, content: string): Promise<string> {
  if (!isTauri) {
    const existing = previewSnippets.find((snippet) => snippet.id === id);
    if (existing) Object.assign(existing, { name, content });
    else previewSnippets.push({ id: `snippet-${previewSnippets.length + 1}`, name, content });
    return id ?? `snippet-${previewSnippets.length}`;
  }
  return invoke<string>("snippet_save", { id, name, content });
}

export async function deleteSnippet(id: string): Promise<void> {
  if (!isTauri) {
    previewSnippets.splice(previewSnippets.findIndex((snippet) => snippet.id === id), 1);
    return;
  }
  await invoke("snippet_delete", { id });
}

const previewSnippets: Snippet[] = [
  { id: "snippet-1", name: "磁盘用量", content: "df -h" },
  { id: "snippet-2", name: "Docker 容器", content: 'docker ps --format "table {{.Names}}\t{{.Status}}"' },
  { id: "snippet-3", name: "最近的系统日志", content: "journalctl -n 100 --no-pager" },
  { id: "snippet-4", name: "重启 nginx", content: "sudo systemctl restart nginx && systemctl status nginx --no-pager" },
];

export type TunnelKind = "local" | "remote" | "dynamic";

export type TunnelStatus =
  | { state: "stopped" }
  | { state: "starting" }
  | { state: "running" }
  | { state: "failed"; message: string };

export interface Tunnel {
  id: string;
  name: string;
  hostId: string;
  kind: TunnelKind;
  bindAddress: string | null;
  bindPort: number;
  targetHost: string | null;
  targetPort: number | null;
  status: TunnelStatus;
}

export type TunnelInput = Omit<Tunnel, "id" | "status"> & { id: string | null };

export async function loadTunnels(): Promise<Tunnel[]> {
  if (!isTauri) return previewTunnels.map((tunnel) => ({ ...tunnel }));
  return invoke<Tunnel[]>("tunnels_list");
}

export async function saveTunnel(input: TunnelInput): Promise<string> {
  if (!isTauri) {
    const existing = previewTunnels.find((tunnel) => tunnel.id === input.id);
    if (existing) Object.assign(existing, input);
    else previewTunnels.push({ ...input, id: `tunnel-${previewTunnels.length + 1}`, status: { state: "stopped" } });
    return input.id ?? `tunnel-${previewTunnels.length}`;
  }
  return invoke<string>("tunnel_save", { input });
}

export async function deleteTunnel(id: string): Promise<void> {
  if (!isTauri) {
    previewTunnels.splice(previewTunnels.findIndex((tunnel) => tunnel.id === id), 1);
    return;
  }
  await invoke("tunnel_delete", { id });
}

const previewListeners = new Set<(id: string, status: TunnelStatus) => void>();

function previewStatus(id: string, status: TunnelStatus) {
  const tunnel = previewTunnels.find((candidate) => candidate.id === id);
  if (tunnel) tunnel.status = status;
  for (const listener of previewListeners) listener(id, status);
}

export async function startTunnel(id: string): Promise<void> {
  if (!isTauri) {
    previewStatus(id, { state: "starting" });
    window.setTimeout(() => previewStatus(id, { state: "running" }), 400);
    return;
  }
  await invoke("tunnel_start", { id });
}

export async function stopTunnel(id: string): Promise<void> {
  if (!isTauri) return previewStatus(id, { state: "stopped" });
  await invoke("tunnel_stop", { id });
}

/** Subscribes to tunnel status changes; returns the unsubscribe function. */
export function onTunnelStatus(handler: (id: string, status: TunnelStatus) => void): () => void {
  if (!isTauri) {
    previewListeners.add(handler);
    return () => previewListeners.delete(handler);
  }
  const stop = listen<{ id: string; status: TunnelStatus }>("tunnel-status", (event) =>
    handler(event.payload.id, event.payload.status),
  );
  return () => void stop.then((unlisten) => unlisten());
}

const previewTunnels: Tunnel[] = [
  {
    id: "tunnel-1",
    name: "生产数据库",
    hostId: "3",
    kind: "local",
    bindAddress: null,
    bindPort: 15432,
    targetHost: "127.0.0.1",
    targetPort: 5432,
    status: { state: "running" },
  },
  {
    id: "tunnel-2",
    name: "内网 SOCKS 代理",
    hostId: "ssh-config:bastion",
    kind: "dynamic",
    bindAddress: null,
    bindPort: 1080,
    targetHost: null,
    targetPort: null,
    status: { state: "stopped" },
  },
  {
    id: "tunnel-3",
    name: "Grafana",
    hostId: "1",
    kind: "local",
    bindAddress: null,
    bindPort: 3000,
    targetHost: "grafana.internal",
    targetPort: 3000,
    status: { state: "failed", message: "bind [127.0.0.1]:3000: Address already in use" },
  },
];
