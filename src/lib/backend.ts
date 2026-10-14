import { invoke } from "@tauri-apps/api/core";
import { previewSnapshot } from "./preview";

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
