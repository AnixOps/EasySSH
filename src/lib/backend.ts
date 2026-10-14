import { Channel, invoke } from "@tauri-apps/api/core";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
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
