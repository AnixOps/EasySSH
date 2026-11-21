/* The frontend half of updates. The Rust side fetches and verifies the signed
   feed and the installer (crates/easyssh-update, src-tauri/src/update*.rs);
   the page shows the result and asks to install it. Free of DOM and Tauri
   imports so it can be tested. */

export interface UpdateInfo {
  version: string;
  build: number;
  /** The installer; downloaded and verified by the backend, never by the page. */
  url: string;
  notes: string;
  publishedAt: string | null;
}

export interface UpdateStatus {
  /** The build has a verification key: updates can be checked. */
  available: boolean;
  autoCheck: boolean;
  current: string;
  /** Unix seconds of the last successful check. */
  lastChecked: number | null;
  /** Only a build newer than the running one. */
  update: UpdateInfo | null;
  /** Whether "Update and restart" works for this installation, or why not. */
  install: InstallSupport;
  /** Installing closes the running terminals (Windows). */
  closesSessions: boolean;
  progress: UpdateProgress;
}

/** In step with `Support` in src-tauri/src/update_install.rs. */
export type InstallSupport = "auto" | "package" | "moveToApplications" | "noPermission" | "none";

export interface UpdateProgress {
  phase: "downloading" | "verifying" | "installing" | "restarting" | null;
  downloaded: number;
  total: number;
}

export const IDLE: UpdateProgress = { phase: null, downloaded: 0, total: 0 };

export const NO_UPDATES: UpdateStatus = {
  available: false,
  autoCheck: true,
  current: "",
  lastChecked: null,
  update: null,
  install: "none",
  closesSessions: false,
  progress: IDLE,
};

/** Whole percent of the download, 0–100. */
export function percent(progress: UpdateProgress): number {
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.floor((progress.downloaded / progress.total) * 100));
}

/** "12.3 / 90.4 MB". */
export function megabytes(progress: UpdateProgress): string {
  const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1);
  return `${mb(progress.downloaded)} / ${mb(progress.total)} MB`;
}

/** A cancelled install is not a failure worth showing. */
export function isCancel(reason: unknown): boolean {
  return String(reason) === "cancelled";
}

/** What the row says: no key, a newer release, current, or never checked. */
export function updateState(status: UpdateStatus): "unavailable" | "found" | "current" | "unchecked" {
  if (!status.available) return "unavailable";
  if (status.update) return "found";
  return status.lastChecked === null ? "unchecked" : "current";
}
