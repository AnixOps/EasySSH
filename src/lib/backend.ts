import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl as openWithSystem, revealItemInDir } from "@tauri-apps/plugin-opener";
import { previewCancel, previewFiles, previewTransfer } from "./previewFiles";
import {
  previewApplyImport,
  previewDeleteHost,
  previewImport,
  previewImportKnownHosts,
  previewKnownHosts,
  previewRemoveKnownHost,
  previewSaveHost,
  previewSerialPorts,
  previewServiceRemembered,
  previewServiceTest,
  previewServicePreview,
  previewSetFavorite,
  previewSnapshot,
} from "./preview";
import { previewMonitorSample, previewMonitorSignal } from "./previewMonitor";
import {
  onPreviewUpdateProgress,
  previewUpdateCancel,
  previewUpdateCheck,
  previewUpdateInstall,
  previewUpdateSetAuto,
  previewUpdateStatus,
} from "./previewUpdate";
import { previewSession } from "./previewSession";
import type { ExitReason } from "./terminalSession";
import {
  previewForgetAll,
  previewSecretsSet,
  previewSecretsStatus,
  previewVault,
  type UnlockItem,
  type UnlockMethod,
  type VaultStatus,
} from "./previewVault";
import type {
  HostsImportApplyParams,
  HostsImportApplyResult,
  HostsImportPreviewResult,
  ImportFormat,
} from "./proto.gen";
import { UNAVAILABLE, type PendingReports, type TelemetryStatus } from "./telemetry";
import type { UpdateProgress, UpdateStatus } from "./update";

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
  /** Per-host SSH engine override; null or "auto" follows the global setting. */
  engine?: EnginePreference | null;
  /** Opt-in: send the shell integration script after login. */
  shellIntegration: boolean;
  /** X11 forwarding (`ssh -X`); the host then connects through OpenSSH. */
  forwardX11?: boolean;
  /** An outbound proxy for the first hop; null or absent connects directly. Its password is a saved secret. */
  proxy?: ProxyFields | null;
  /** Set for a serial port; the SSH fields are then unused. */
  serial?: SerialFields | null;
}

/** SOCKS5 (RFC 1928, with username and password) or HTTP CONNECT (with basic authentication). */
export type ProxyKind = "socks5" | "http";

/** Where a host's outbound proxy is. Mirrors `ProxySettings` in easyssh-core; the password is a saved secret. */
export interface ProxyFields {
  kind: ProxyKind;
  host: string;
  port: number;
  /** The login; null or empty means no authentication. */
  username?: string | null;
}

export type SerialParity = "none" | "odd" | "even";
export type SerialFlowControl = "none" | "software" | "hardware";

/** How to open a serial port. Mirrors `SerialFields` in src-tauri/src/hosts.rs. */
export interface SerialFields {
  /** The device path: /dev/ttyUSB0, /dev/cu.usbserial-1410, COM3. */
  port: string;
  baud: number;
  dataBits: number;
  parity: SerialParity;
  stopBits: number;
  flowControl: SerialFlowControl;
}

/** A serial port the operating system lists. */
export interface SerialPortInfo {
  path: string;
  /** What the OS knows about it, such as the USB product. */
  description: string | null;
}

/** Which SSH engine runs a host: the built-in one (russh) or the system OpenSSH. */
export type SshEngine = "openssh" | "russh";
export type EnginePreference = "auto" | "russh" | "openssh";

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

export type SessionEvent =
  | { kind: "data"; data: string }
  /** `reason` and `signal` are missing from older backends; see terminalSession.ts. */
  | { kind: "exit"; code: number | null; reason?: ExitReason; signal?: string }
  /** The connection to the background daemon dropped; output resumes after "resumed". */
  | { kind: "reconnecting"; attempt?: number; delay_ms?: number }
  | { kind: "resumed" };

export interface SessionHandle {
  /** The daemon's id for the session, kept so a layout can reattach to it. */
  id: string;
  write(data: string): void;
  /** Like `write`, resolving once the backend has taken the data (rz/sz paces itself on it). */
  writeAsync?(data: string): Promise<void>;
  resize(cols: number, rows: number): void;
  /** Stops listening; the session keeps running in the background daemon. */
  detach(): void;
  /** Ends the session. */
  close(): void;
  /** Mobile, attached sessions: replace the connection now (the app is back
   *  in front and the old socket cannot be trusted). */
  reconnect?(): void;
  /** The engine the session runs on; absent for a local shell. */
  engine?: SshEngine | null;
  /** Why that engine was chosen (English, for a tooltip). */
  engineReason?: string | null;
}

/** A session that outlived the window, as the background daemon reports it. */
export interface LiveSession {
  id: string;
  hostId: string | null;
  cols: number;
  rows: number;
  running: boolean;
  exitCode: number | null;
  engine?: SshEngine | null;
  engineReason?: string | null;
}

/** False in a plain browser (vite dev, CI screenshots): use preview data. */
export const isTauri = "__TAURI_INTERNALS__" in window;

export async function loadHosts(): Promise<HostsSnapshot> {
  if (!isTauri) return previewSnapshot();
  return invoke<HostsSnapshot>("load_hosts");
}

/** Subscribes to host list changes made anywhere (another window, the daemon); returns the unsubscribe function. */
export function onHostsChanged(handler: () => void): () => void {
  if (!isTauri) return () => {};
  const stop = listen("hosts-changed", () => handler());
  return () => void stop.then((unlisten) => unlisten());
}

/** Calls `handler` with each `anixops-ssh://` link the app is opened with, at
 *  start and while it runs; returns the unsubscribe function. A plain browser
 *  has none. */
export function onDeepLink(handler: (urls: string[]) => void): () => void {
  if (!isTauri) return () => {};
  let stopped = false;
  let stop: (() => void) | undefined;
  void import("@tauri-apps/plugin-deep-link")
    .then(async ({ getCurrent, onOpenUrl }) => {
      const current = await getCurrent();
      if (current?.length && !stopped) handler(current);
      const unlisten = await onOpenUrl(handler);
      if (stopped) unlisten();
      else stop = unlisten;
    })
    .catch(console.error);
  return () => {
    stopped = true;
    stop?.();
  };
}

export async function saveHost(input: HostInput): Promise<string> {
  if (!isTauri) return previewSaveHost(input);
  return invoke<string>("host_save", { input });
}

/** Turns the shell integration on for a saved host (from its next
 *  connection), keeping everything else as it is. False when the host is
 *  not a saved one (a ~/.ssh/config entry is changed through the editor). */
export async function enableShellIntegration(hostId: string): Promise<boolean> {
  const { hosts, groups } = await loadHosts();
  const host = hosts.find((candidate) => candidate.id === hostId);
  if (!host || host.source !== "saved") return false;
  await saveHost({
    id: host.id,
    name: host.name,
    group: groups.find((group) => group.id === host.groupId)?.name ?? null,
    tags: host.tags,
    favorite: host.favorite,
    color: host.color,
    fields: { ...host.fields, shellIntegration: true },
  });
  return true;
}

export async function deleteHost(id: string): Promise<void> {
  if (!isTauri) return previewDeleteHost(id);
  await invoke("host_delete", { id });
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  if (!isTauri) return previewSetFavorite(id, favorite);
  await invoke("host_set_favorite", { id, favorite });
}

export type {
  HostsImportApplyParams,
  HostsImportApplyResult,
  HostsImportPreviewResult,
  ImportDuplicatePolicy,
  ImportFormat,
  ImportHost,
} from "./proto.gen";

/** What an import reads: a file the user picked, or `~/.ssh/config` on their command. */
export type ImportSource = { kind: "file"; path: string } | { kind: "ssh_config" } | { kind: "service"; request: ServiceRequest };

/** The services hosts can be imported from. */
export type ServiceId = "control" | "jumpserver";

/** The plain settings of a service import (what the form remembers). */
export interface ServiceForm {
  url: string;
  default_user: string;
  identity_file: string | null;
  /** JumpServer only: */
  access_key_id: string;
  org_id: string;
  gateway: boolean;
  gateway_host: string;
  gateway_port: number;
  gateway_user: string;
}

/** What the form opens with: the saved settings, and whether a credential is saved in the vault. */
export interface ServiceRemembered {
  form: ServiceForm;
  has_secret: boolean;
}

/** `secret` is only set when the user typed a new credential; the saved one is used otherwise. */
export interface ServiceRequest {
  service: ServiceId;
  form: ServiceForm;
  secret: string | null;
  clear_secret: boolean;
}

export async function serviceRemembered(service: ServiceId): Promise<ServiceRemembered> {
  if (!isTauri) return previewServiceRemembered(service);
  return invoke<ServiceRemembered>("service_remembered", { service });
}

/** Tests the address and credential; resolves to the number of hosts the service lists. */
export async function testService(request: ServiceRequest): Promise<number> {
  if (!isTauri) return previewServiceTest(request);
  return invoke<number>("service_test", { request });
}

/** Asks for a host list file. Returns null if cancelled. */
export async function pickImportFile(): Promise<string | null> {
  if (!isTauri) return "/Users/you/Downloads/sessions.csv";
  const picked = await openDialog({ multiple: false, directory: false });
  return typeof picked === "string" ? picked : null;
}

/** Parses `source` and marks hosts that are stored already. Writes nothing.
 *  `format` overrides detection. */
export async function previewImportHosts(
  source: ImportSource,
  format: ImportFormat | null,
): Promise<HostsImportPreviewResult> {
  if (source.kind === "service") {
    if (!isTauri) return previewServicePreview(source.request);
    return invoke<HostsImportPreviewResult>("service_preview", { request: source.request });
  }
  if (!isTauri) return previewImport(source.kind, format);
  return source.kind === "ssh_config"
    ? invoke<HostsImportPreviewResult>("import_preview_ssh_config", { format })
    : invoke<HostsImportPreviewResult>("import_preview_file", { path: source.path, format });
}

/** Merges the selected hosts. Adds and updates only; never removes. */
export async function applyImportHosts(request: HostsImportApplyParams): Promise<HostsImportApplyResult> {
  if (!isTauri) return previewApplyImport(request);
  return invoke<HostsImportApplyResult>("import_apply_hosts", { request });
}

/** A host key the app trusts. Only the fingerprint is shown, never the key. */
export interface KnownHost {
  id: string;
  /** A name, `[host]:port`, a comma list, or a hash digest when `hashed`. */
  host: string;
  port: number;
  hashed: boolean;
  /** `@cert-authority` or `@revoked`. */
  marker: string | null;
  keyType: string;
  fingerprint: string;
  comment: string | null;
  addedAt: string;
}

export interface KnownHostsImport {
  imported: number;
  duplicates: number;
  skipped: { line: number; reason: string }[];
}

export async function listKnownHosts(): Promise<KnownHost[]> {
  if (!isTauri) return previewKnownHosts();
  return invoke<KnownHost[]>("known_hosts_list");
}

/** Imports the user's `~/.ssh/known_hosts` (the backend finds the file). */
export async function importKnownHosts(): Promise<KnownHostsImport> {
  if (!isTauri) return previewImportKnownHosts();
  return invoke<KnownHostsImport>("known_hosts_import");
}

export async function removeKnownHost(id: string): Promise<void> {
  if (!isTauri) return previewRemoveKnownHost(id);
  await invoke("known_hosts_remove", { id });
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

/** Injected by the terminal end-to-end test only (never present in the app). */
interface E2eSessionBridge {
  open(hostId: string | null, cols: number, rows: number, onEvent: (event: SessionEvent) => void): Promise<SessionHandle>;
}

/** Starts `ssh` for `hostId` (or a local shell when null) in a PTY. */
export async function openSession(
  hostId: string | null,
  cols: number,
  rows: number,
  onEvent: (event: SessionEvent) => void,
  /** The touch app only: attach to `tmux` or `screen` on the host and the
   *  SSH keepalive interval in seconds (0 turns it off). */
  options?: { attach?: "tmux" | "screen"; keepaliveSecs?: number },
): Promise<SessionHandle> {
  if (!isTauri) {
    // The terminal end-to-end test (scripts/terminal-e2e.mjs) puts a real
    // session daemon behind the browser; everything else stays preview data.
    const bridge = (window as { __anixopsE2eSession?: E2eSessionBridge }).__anixopsE2eSession;
    if (bridge) return bridge.open(hostId, cols, rows, onEvent);
    return previewSession(hostId, onEvent, options?.attach);
  }
  const events = new Channel<SessionEvent>();
  events.onmessage = onEvent;
  const opened = await invoke<{ id: string; engine: SshEngine | null; engineReason: string | null }>(
    "session_open",
    { hostId, cols, rows, events, attach: options?.attach, keepaliveSecs: options?.keepaliveSecs },
  );
  return sessionHandle(opened.id, opened.engine, opened.engineReason);
}

function sessionHandle(id: string, engine: SshEngine | null = null, engineReason: string | null = null): SessionHandle {
  const report = (reason: unknown) => console.error(reason);
  return {
    id,
    engine,
    engineReason,
    write: (data) => void invoke("session_write", { id, data }).catch(report),
    writeAsync: (data) => invoke<void>("session_write", { id, data }),
    resize: (cols, rows) => void invoke("session_resize", { id, cols, rows }).catch(report),
    detach: () => void invoke("session_detach", { id }).catch(report),
    close: () => void invoke("session_close", { id }).catch(report),
    reconnect: () => void invoke("session_reconnect", { id }).catch(report),
  };
}

/** Sessions still running in the background daemon (empty outside the app). */
export async function listSessions(): Promise<LiveSession[]> {
  if (!isTauri) return [];
  return invoke<LiveSession[]>("sessions_list");
}

/** Reattaches to a live session: buffered output is replayed first, then live output follows. */
export async function attachSession(
  id: string,
  onEvent: (event: SessionEvent) => void,
): Promise<SessionHandle> {
  if (!isTauri) throw new Error("no daemon outside the app");
  const events = new Channel<SessionEvent>();
  events.onmessage = onEvent;
  const attached = await invoke<{ engine: SshEngine | null; engineReason: string | null }>("session_attach", {
    id,
    events,
  });
  return sessionHandle(id, attached.engine, attached.engineReason);
}

/** Opens a web link in the default browser. Callers check it first (shouldOpenLink). */
export async function openUrl(url: string): Promise<void> {
  if (isTauri) await openWithSystem(url);
  else window.open(url, "_blank", "noopener,noreferrer");
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
  /** The owner and group as the server reported them (a name or a number), when it did. */
  owner?: string | null;
  group?: string | null;
}

export interface FilesHandle {
  home: string;
  list(path: string): Promise<RemoteFile[]>;
  mkdir(path: string): Promise<void>;
  remove(path: string, directory: boolean): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Sets the permission bits (`0o755` style); `recursive` applies them to everything inside a folder too. */
  chmod(path: string, mode: number, recursive: boolean): Promise<void>;
  close(): void;
}

export type TransferEvent =
  | { kind: "started" }
  | { kind: "progress"; bytes: number; total?: number | null }
  | { kind: "done" }
  | { kind: "failed"; message: string }
  | { kind: "cancelled" };

export interface TransferRequest {
  hostId: string;
  upload: boolean;
  /** Upload: the remote directory. Download: the remote path. */
  remote: string;
  /** Upload: the local file or folder. Download: a file in the editor cache (see `editPrepare`) instead of Downloads. */
  local?: string;
}

export interface StartedTransfer {
  id: string;
  local: string;
  remote: string;
  /** Waits for the host's other transfers; a "started" event follows when its turn comes. */
  queued?: boolean;
}

/** The file side of the end-to-end bridge (scripts/terminal-e2e.mjs): the
 *  real daemon's SFTP and transfer queue in place of the preview's files. */
interface E2eFilesBridge {
  open(hostId: string): Promise<FilesHandle>;
  transfer(request: TransferRequest, onEvent: (event: TransferEvent) => void): Promise<StartedTransfer>;
  cancel(id: string): Promise<void>;
  pickUploads(): Promise<string[]>;
}

function e2eFiles(): E2eFilesBridge | undefined {
  return (window as { __anixopsE2eFiles?: E2eFilesBridge }).__anixopsE2eFiles;
}

/** Opens a long-lived sftp process for browsing `hostId`. */
export async function openFiles(hostId: string): Promise<FilesHandle> {
  if (!isTauri) return e2eFiles()?.open(hostId) ?? previewFiles();
  const { id, home } = await invoke<{ id: string; home: string }>("sftp_open", { hostId });
  return {
    home,
    list: (path) => invoke<RemoteFile[]>("sftp_list", { id, path }),
    mkdir: (path) => invoke("sftp_mkdir", { id, path }),
    remove: (path, directory) => invoke("sftp_remove", { id, path, directory }),
    rename: (from, to) => invoke("sftp_rename", { id, from, to }),
    chmod: (path, mode, recursive) => invoke("sftp_chmod", { id, path, mode, recursive }),
    close: () => void invoke("sftp_close", { id }).catch(console.error),
  };
}

/** One raw monitor sample (see `src/lib/monitor.ts`). */
export interface MonitorSample {
  output: string;
  /** Keepalive round trip; null when the server did not answer it. */
  latency_ms: number | null;
}

/** Why a sample failed: `wrong_engine` (the host runs on OpenSSH),
 *  `not_connected` (no terminal connection to read through), others. */
export interface MonitorFailure {
  code: string;
  message: string;
}

export function monitorFailure(reason: unknown): MonitorFailure {
  if (reason && typeof reason === "object" && "code" in reason) {
    const { code, message } = reason as { code: unknown; message?: unknown };
    return { code: String(code), message: String(message ?? "") };
  }
  return { code: "failed", message: String(reason) };
}

/** Reads the server's load, memory, network, disks and processes on the
 *  connection the terminal already has. `detail` adds owners, command lines
 *  and executables. */
export async function monitorSample(hostId: string, detail: boolean): Promise<MonitorSample> {
  if (!isTauri) return previewMonitorSample(detail);
  return invoke<MonitorSample>("monitor_sample", { hostId, detail });
}

export type MonitorSignal = "TERM" | "KILL";

/** Sends a signal to a process on the server, as the login user. */
export async function monitorSignal(hostId: string, pid: number, signal: MonitorSignal): Promise<void> {
  if (!isTauri) return previewMonitorSignal(pid);
  await invoke("monitor_signal", { hostId, pid, signal });
}

export async function startTransfer(
  request: TransferRequest,
  onEvent: (event: TransferEvent) => void,
): Promise<StartedTransfer> {
  if (!isTauri) return e2eFiles()?.transfer(request, onEvent) ?? previewTransfer(request, onEvent);
  const events = new Channel<TransferEvent>();
  events.onmessage = onEvent;
  return invoke<StartedTransfer>("transfer_start", { ...request, local: request.local ?? null, events });
}

export async function cancelTransfer(id: string): Promise<void> {
  if (!isTauri) return e2eFiles()?.cancel(id) ?? previewCancel(id);
  await invoke("transfer_cancel", { id });
}

export async function pickUploads(): Promise<string[]> {
  if (!isTauri) return e2eFiles()?.pickUploads() ?? ["/Users/you/Desktop/release-notes.md"];
  const picked = await openDialog({ multiple: true, directory: false });
  if (picked === null) return [];
  return Array.isArray(picked) ? picked : [picked];
}

/** Where the local copy of `remote` for editing goes; its folder is emptied. */
export async function editPrepare(hostId: string, remote: string): Promise<string> {
  if (!isTauri) return `/tmp/anixops-edit/${remote.split("/").filter(Boolean).pop() ?? "file"}`;
  return invoke<string>("edit_prepare", { hostId, remote });
}

/** Opens the copy with the editor from Settings, or the system's default application. */
export async function editOpen(local: string): Promise<void> {
  if (isTauri) await invoke("edit_open", { local });
}

/** Reports saves of `local`; the returned function stops listening (the watch itself ends with `editStop`). */
export async function editWatch(key: string, local: string, onSaved: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const stop = await listen<string>("edit-saved", (event) => event.payload === key && onSaved());
  try {
    await invoke("edit_watch", { key, local });
  } catch (reason) {
    stop();
    throw reason;
  }
  return stop;
}

/** Stops watching and deletes the copy. */
export async function editStop(key: string, local: string): Promise<void> {
  if (isTauri) await invoke("edit_stop", { key, local });
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
  /** What the built-in engine asks for; absent for OpenSSH's prompts. */
  kind?: "password" | "passphrase" | "keyboard_interactive" | "security_key_pin" | "security_key_touch";
  /** Whether the answer may be shown while typing. */
  echo?: boolean;
  /** The saved host's password or key passphrase: offer "Remember in vault". */
  rememberable?: boolean;
  /** An answer is saved for this host but the vault is locked. */
  vaultLocked?: boolean;
}

/** The built-in engine needs a decision about a host key. */
export interface HostKeyPrompt {
  id: number;
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  /** "changed" means the server presents another key than the recorded one. */
  status: "unknown" | "changed";
  /** Fingerprints on record when the key changed; for an "unknown" key of a
   *  new type, the host's recorded keys of other types. */
  expected: string[];
}

export type HostKeyDecision = "reject" | "accept_once" | "accept_and_save" | "replace_and_save";

/** Subscribes to host key questions; returns the unsubscribe function. */
export function onHostKey(handler: (prompt: HostKeyPrompt) => void): () => void {
  if (!isTauri) {
    const preview = new URLSearchParams(window.location.search).get("hostkey");
    if (preview === "unknown" || preview === "changed") {
      window.setTimeout(
        () =>
          handler({
            id: 1,
            host: "prod-db",
            port: 22,
            algorithm: "ssh-ed25519",
            fingerprint: "SHA256:3fA9k2Lq0yQkZf1mJb7Vx2c8Tn5Rw4Hs6Pd0Ue1Gi9o",
            status: preview,
            expected: preview === "changed" ? ["SHA256:Qw8Zr1Xn4Cv7Bm2Lk9Jh6Gf3Dt0Sa5Pe8Yu1Io4Ru7"] : [],
          }),
        300,
      );
    }
    return () => {};
  }
  const stop = listen<HostKeyPrompt>("hostkey", (event) => handler(event.payload));
  return () => void stop.then((unlisten) => unlisten());
}

/** Subscribes to host key questions that were answered elsewhere or timed out. */
export function onHostKeyResolved(handler: (id: number) => void): () => void {
  if (!isTauri) return () => {};
  const stop = listen<{ id: number }>("hostkey-resolved", (event) => handler(event.payload.id));
  return () => void stop.then((unlisten) => unlisten());
}

export function replyHostKey(id: number, decision: HostKeyDecision): void {
  if (isTauri) void invoke("hostkey_reply", { id, decision }).catch(console.error);
}

/** Subscribes to OpenSSH prompts; returns the unsubscribe function. */
export function onAskpass(handler: (prompt: AskpassPrompt) => void): () => void {
  if (!isTauri) {
    const preview = new URLSearchParams(window.location.search).get("askpass");
    const samples: Record<string, AskpassPrompt> = {
      "1": { id: 1, host: "prod-db", prompt: "postgres@10.0.2.20's password: ", confirm: false },
      touch: {
        id: 2,
        host: "prod-db",
        prompt: "Touch your security key (id_ed25519_sk)",
        confirm: false,
        kind: "security_key_touch",
      },
      pin: {
        id: 3,
        host: "prod-db",
        prompt: "Enter the PIN of your security key (id_ed25519_sk)",
        confirm: false,
        kind: "security_key_pin",
        echo: false,
      },
    };
    const sample = preview ? samples[preview] : undefined;
    if (sample) window.setTimeout(() => handler(sample), 300);
    return () => {};
  }
  const stop = listen<AskpassPrompt>("askpass", (event) => handler(event.payload));
  return () => void stop.then((unlisten) => unlisten());
}

/** Subscribes to prompts that another window answered or that timed out; returns the unsubscribe function. */
export function onAskpassResolved(handler: (id: number) => void): () => void {
  if (!isTauri) return () => {};
  const stop = listen<{ id: number }>("askpass-resolved", (event) => handler(event.payload.id));
  return () => void stop.then((unlisten) => unlisten());
}

export function replyAskpass(id: number, answer: string | null, remember = false): void {
  if (isTauri) void invoke("askpass_reply", { id, answer, remember }).catch(console.error);
}

/** Unlocks the vault from a prompt that needs it; the saved answer then goes to OpenSSH. */
export async function unlockForAskpass(id: number, passphrase: string): Promise<void> {
  if (isTauri) await invoke("askpass_unlock", { id, passphrase });
}

export type { UnlockItem, UnlockMethod, VaultStatus };

/** Which secrets a host has saved. The values never come back to the UI. */
export interface SecretsStatus {
  password: boolean;
  privateKey: boolean;
  passphrase: boolean;
  /** The password of the host's outbound proxy. */
  proxyPassword: boolean;
}

/** A field left out keeps the saved value; an empty string clears it. */
export interface SecretsInput {
  password?: string;
  privateKey?: string;
  passphrase?: string;
  proxyPassword?: string;
}

/** The vault's state for Settings → Security. */
export async function vaultStatus(): Promise<VaultStatus> {
  return isTauri ? invoke<VaultStatus>("vault_status") : previewVault.status();
}

export async function vaultUnlock(passphrase: string): Promise<VaultStatus> {
  return isTauri ? invoke<VaultStatus>("vault_unlock", { passphrase }) : previewVault.unlock(passphrase);
}

/** Opens the vault with Windows Hello or Touch ID; the system prompt appears. */
export async function vaultUnlockWith(method: string): Promise<VaultStatus> {
  return isTauri ? invoke<VaultStatus>("vault_unlock_with", { method }) : previewVault.unlockWith(method);
}

/** Turns Windows Hello or Touch ID on; the vault passphrase confirms it. */
export async function vaultEnableUnlock(method: string, passphrase: string): Promise<VaultStatus> {
  return isTauri
    ? invoke<VaultStatus>("vault_enable_unlock", { method, passphrase })
    : previewVault.enableUnlock(method, passphrase);
}

/** Adds a security key to the vault: the passphrase confirms, then the key asks for a touch (twice) and its PIN. */
export async function vaultAddUnlockItem(method: string, passphrase: string, label: string): Promise<VaultStatus> {
  return isTauri
    ? invoke<VaultStatus>("vault_add_unlock_item", { method, passphrase, label })
    : previewVault.addUnlockItem(method, passphrase, label);
}

/** Removes one security key from the vault. */
export async function vaultRemoveUnlockItem(method: string, id: string): Promise<VaultStatus> {
  return isTauri
    ? invoke<VaultStatus>("vault_remove_unlock_item", { method, id })
    : previewVault.removeUnlockItem(method, id);
}

export async function vaultDisableUnlock(method: string): Promise<VaultStatus> {
  return isTauri ? invoke<VaultStatus>("vault_disable_unlock", { method }) : previewVault.disableUnlock(method);
}

/** The serial ports of this machine. */
export async function serialPorts(): Promise<SerialPortInfo[]> {
  if (!isTauri) return previewSerialPorts();
  return invoke<SerialPortInfo[]>("serial_ports");
}

export async function vaultLock(): Promise<VaultStatus> {
  return isTauri ? invoke<VaultStatus>("vault_lock") : previewVault.lock();
}

/** Sets the passphrase, or changes it when `current` is given. */
export async function vaultSetPassphrase(passphrase: string, current: string | null = null): Promise<VaultStatus> {
  return isTauri
    ? invoke<VaultStatus>("vault_set_passphrase", { passphrase, current })
    : previewVault.setPassphrase(passphrase, current);
}

export async function vaultRemovePassphrase(passphrase: string): Promise<VaultStatus> {
  return isTauri
    ? invoke<VaultStatus>("vault_remove_passphrase", { passphrase })
    : previewVault.removePassphrase(passphrase);
}

export async function vaultSetAutoLock(minutes: number): Promise<VaultStatus> {
  return isTauri ? invoke<VaultStatus>("vault_set_auto_lock", { minutes }) : previewVault.setAutoLock(minutes);
}

/** Mobile: seconds the app may stay in the background before the vault locks. */
export async function vaultSetBackgroundLock(
  seconds: number,
): Promise<VaultStatus> {
  return isTauri
    ? invoke<VaultStatus>("vault_set_background_lock", { seconds })
    : previewVault.setBackgroundLock(seconds);
}

/** Mobile first run: use this device only, no passphrase. */
export async function vaultSetupSkip(): Promise<VaultStatus> {
  return isTauri
    ? invoke<VaultStatus>("vault_setup_skip")
    : previewVault.setupSkip();
}

/** Mobile: the app left the screen (the vault may lock now). */
export async function vaultBackground(): Promise<void> {
  if (isTauri) await invoke("vault_background");
  else await previewVault.background();
}

/** Mobile: the app is back on screen (the vault locks if it was away too long). */
export async function vaultForeground(): Promise<void> {
  if (isTauri) await invoke("vault_foreground");
  else await previewVault.foreground();
}

/** Deletes every saved password, key and passphrase; resolves to the number of hosts that had any. */
export async function vaultForgetAll(): Promise<number> {
  return isTauri ? invoke<number>("vault_forget_all") : previewForgetAll();
}

export async function secretsStatus(hostId: string): Promise<SecretsStatus> {
  return isTauri ? invoke<SecretsStatus>("secrets_status", { hostId }) : previewSecretsStatus(hostId);
}

export async function secretsSet(hostId: string, input: SecretsInput): Promise<SecretsStatus> {
  return isTauri
    ? invoke<SecretsStatus>("secrets_set", {
        hostId,
        password: input.password ?? null,
        privateKey: input.privateKey ?? null,
        passphrase: input.passphrase ?? null,
        proxyPassword: input.proxyPassword ?? null,
      })
    : previewSecretsSet(hostId, input);
}

/** Subscribes to the vault locking or unlocking (auto-lock included); returns the unsubscribe function. */
export function onVaultChanged(handler: (unlocked: boolean) => void): () => void {
  if (!isTauri) return previewVault.onChanged(handler);
  const stop = listen<{ unlocked: boolean }>("vault-changed", (event) => handler(event.payload.unlocked));
  return () => void stop.then((unlisten) => unlisten());
}

/** True when an error from the backend says the vault has to be unlocked first. */
export function isVaultLocked(reason: unknown): boolean {
  return String(reason).includes("the vault is locked");
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
  /** `port`: the port that listens (it differs from the saved one for a
   *  tunnel saved with port 0, any free port). `lastError`/`errorCount`:
   *  connections the forward accepted but could not pass on (the target
   *  refused, the server prohibits it). */
  | { state: "running"; port?: number; lastError?: string; errorCount?: number }
  /** The connection dropped; the forward is closed while it reconnects. */
  | { state: "reconnecting"; message?: string }
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

/** The forwarding side of the end-to-end bridge (scripts/terminal-e2e.mjs):
 *  the real daemon's tunnels in place of the preview's. */
interface E2eTunnelsBridge {
  start(tunnel: Tunnel, onStatus: (status: TunnelStatus) => void): Promise<void>;
  stop(id: string): Promise<void>;
}

function e2eTunnels(): E2eTunnelsBridge | undefined {
  return (window as { __anixopsE2eTunnels?: E2eTunnelsBridge }).__anixopsE2eTunnels;
}

export async function startTunnel(id: string): Promise<void> {
  const bridge = isTauri ? undefined : e2eTunnels();
  const tunnel = previewTunnels.find((candidate) => candidate.id === id);
  if (bridge && tunnel) {
    previewStatus(id, { state: "starting" });
    return bridge.start(tunnel, (status) => previewStatus(id, status));
  }
  if (!isTauri) {
    previewStatus(id, { state: "starting" });
    window.setTimeout(() => previewStatus(id, { state: "running" }), 400);
    return;
  }
  await invoke("tunnel_start", { id });
}

export async function stopTunnel(id: string): Promise<void> {
  if (!isTauri && e2eTunnels()) return e2eTunnels()?.stop(id);
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
    status: { state: "running", port: 15432 },
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
  {
    id: "tunnel-4",
    name: "内网 Redis",
    hostId: "3",
    kind: "local",
    bindAddress: null,
    bindPort: 16379,
    targetHost: "redis.internal",
    targetPort: 6379,
    status: { state: "running", port: 16379, lastError: "redis.internal:6379: connect failed", errorCount: 2 },
  },
  {
    id: "tunnel-5",
    name: "Docker",
    hostId: "1",
    kind: "local",
    bindAddress: null,
    bindPort: 2375,
    targetHost: "/run/docker.sock",
    targetPort: null,
    status: { state: "stopped" },
  },
];

export interface SshStatus {
  sshVersion: string | null;
  sftpFound: boolean;
  agent: "ready" | "empty" | "unavailable";
  agentKeys: string[];
  /** Which agent the built-in engine found; null when none or only ssh-add answered. */
  agentKind: "openssh" | "pageant" | "environment" | null;
  agentError: string | null;
  sshConfigHosts: number;
}

/** Installed monospace font families, for the terminal font list; empty outside the app. */
export async function monospaceFonts(): Promise<string[]> {
  if (!isTauri) return ["Menlo", "Consolas", "JetBrains Mono", "Fira Code"];
  return invoke<string[]>("monospace_fonts");
}

/** Checks OpenSSH and the SSH agent. `?ssh=missing` previews a bare machine. */
export async function sshStatus(): Promise<SshStatus> {
  if (!isTauri) {
    if (new URLSearchParams(window.location.search).get("ssh") === "missing") {
      return { sshVersion: null, sftpFound: false, agent: "unavailable", agentKeys: [], agentKind: null, agentError: null, sshConfigHosts: 0 };
    }
    return {
      sshVersion: "OpenSSH_9.5p1, LibreSSL 3.3.6",
      sftpFound: true,
      agent: "ready",
      agentKeys: ["256 SHA256:3fA9k2Lq0yQkZf1mJb7Vx2c8Tn5Rw4Hs6Pd0Ue1Gi9o you@laptop (ED25519)"],
      agentKind: "environment",
      agentError: null,
      sshConfigHosts: 1,
    };
  }
  return invoke<SshStatus>("ssh_status");
}

export interface ImportSummary {
  hosts: number;
  groups: number;
  snippets: number;
  tunnels: number;
  skipped: number;
}

export interface SyncState {
  configured: boolean;
  repositoryPath: string | null;
  remoteUrl: string | null;
  branch: string;
  lastSuccessAt: string | null;
  lastError: string | null;
}

/** Asks where to save, then writes the export. Returns false if cancelled. */
export async function exportConfig(): Promise<boolean> {
  if (!isTauri) return true;
  const path = await saveDialog({
    defaultPath: "anixops-ssh-hosts.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;
  await invoke("config_export", { path });
  return true;
}

/** Asks for a file, then merges it. Returns null if cancelled. */
export async function importConfig(): Promise<ImportSummary | null> {
  if (!isTauri) return { hosts: 7, groups: 3, snippets: 4, tunnels: 3, skipped: 0 };
  const path = await openDialog({ multiple: false, directory: false, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (typeof path !== "string") return null;
  return invoke<ImportSummary>("config_import", { path });
}

const previewSync: SyncState = {
  configured: false,
  repositoryPath: null,
  remoteUrl: null,
  branch: "main",
  lastSuccessAt: null,
  lastError: null,
};

export async function loadSync(): Promise<SyncState> {
  if (!isTauri) return { ...previewSync };
  return invoke<SyncState>("sync_get");
}

export async function setupSync(repositoryPath: string, remoteUrl: string | null, branch: string | null): Promise<void> {
  if (!isTauri) {
    Object.assign(previewSync, { configured: true, repositoryPath, remoteUrl, branch: branch ?? "main" });
    return;
  }
  await invoke("sync_setup", { repositoryPath, remoteUrl, branch });
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return "/Users/you/hosts-sync";
  const picked = await openDialog({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}

export async function syncPush(): Promise<void> {
  if (!isTauri) {
    previewSync.lastSuccessAt = new Date().toISOString();
    return;
  }
  await invoke("sync_push");
}

export async function syncPull(): Promise<boolean> {
  if (!isTauri) {
    previewSync.lastSuccessAt = new Date().toISOString();
    return true;
  }
  return invoke<boolean>("sync_pull");
}

/* Crash reports and usage statistics; see telemetry.ts and docs/telemetry.md. */

export async function telemetryStatus(): Promise<TelemetryStatus> {
  if (!isTauri) return UNAVAILABLE;
  return invoke<TelemetryStatus>("telemetry_status");
}

export async function telemetryPending(): Promise<PendingReports> {
  if (!isTauri) return { reports: [], usage: null };
  return invoke<PendingReports>("telemetry_pending");
}

export async function telemetryDeletePending(): Promise<number> {
  if (!isTauri) return 0;
  return invoke<number>("telemetry_delete_pending");
}

/* Updates; see update.ts, crates/easyssh-update and src-tauri/src/update*.rs. */

export async function updateStatus(): Promise<UpdateStatus> {
  if (!isTauri) return previewUpdateStatus();
  return invoke<UpdateStatus>("update_status");
}

export async function updateSetAuto(on: boolean): Promise<UpdateStatus> {
  if (!isTauri) return previewUpdateSetAuto(on);
  return invoke<UpdateStatus>("update_set_auto", { on });
}

/** Rejects with the reason when the feed could not be fetched or verified. */
export async function updateCheck(): Promise<UpdateStatus> {
  if (!isTauri) return previewUpdateCheck();
  return invoke<UpdateStatus>("update_check");
}

/** Opens the release page in the browser (installations the app cannot
 *  update, such as a .deb); the backend names the URL. */
export async function updateOpen(): Promise<void> {
  if (!isTauri) return;
  await invoke("update_open");
}

/** Downloads, verifies, installs and restarts. Resolves only when the app
 *  did not restart; rejects with "cancelled" after `updateCancel`. */
export async function updateInstall(): Promise<void> {
  if (!isTauri) return previewUpdateInstall();
  await invoke("update_install");
}

export async function updateCancel(): Promise<void> {
  if (!isTauri) return previewUpdateCancel();
  await invoke("update_cancel");
}

/** Install progress, and a background check that found something. */
export function onUpdateEvents(
  onProgress: (progress: UpdateProgress) => void,
  onStatus: (status: UpdateStatus) => void,
): () => void {
  if (!isTauri) return onPreviewUpdateProgress(onProgress);
  const stops = [
    listen<UpdateProgress>("update-progress", (event) => onProgress(event.payload)),
    listen<UpdateStatus>("update-status", (event) => onStatus(event.payload)),
  ];
  return () => stops.forEach((stop) => void stop.then((unlisten) => unlisten()));
}

/** The Rust side scrubs `message` and `stack` and decides whether to keep them. */
export async function reportFrontendError(kind: string, message: string, stack: string): Promise<void> {
  if (!isTauri) return;
  await invoke("telemetry_report_frontend", { kind, message, stack });
}
