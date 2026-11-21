import { IDLE, type InstallSupport, type UpdateProgress, type UpdateStatus } from "./update";

/** The update rows in the browser preview, in step with `UpdateStatus` in
 *  src-tauri/src/update.rs. `?update=found` shows a newer release that installs
 *  from the app, `?update=installing` one downloading, `?update=package` a
 *  .deb installation, `?update=off` a build without a verification key. */
const scene = new URLSearchParams(window.location.search).get("update");
const hasUpdate = scene === "found" || scene === "installing" || scene === "package";
const install: InstallSupport = scene === "package" ? "package" : "auto";
const TOTAL = 94_779_896;

let updates: UpdateStatus = {
  available: scene !== "off",
  autoCheck: true,
  current: "preview",
  lastChecked: scene === "off" ? null : 1_800_000_000,
  update: hasUpdate
    ? {
        version: "2.4.0",
        build: 2_004_000,
        url: "https://github.com/AnixOps/EasySSH/releases/download/v2.4.0/AnixOps-SSH_2.4.0_amd64.AppImage",
        notes: "内置 SSH 引擎修复了跳板机重连；设置里可以一键更新并重启。",
        publishedAt: "2027-01-15T08:00:00Z",
      }
    : null,
  install,
  closesSessions: false,
  progress: scene === "installing" ? { phase: "downloading", downloaded: Math.round(TOTAL * 0.37), total: TOTAL } : IDLE,
};

const listeners = new Set<(progress: UpdateProgress) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let cancelled: (() => void) | undefined;

function setProgress(progress: UpdateProgress) {
  updates = { ...updates, progress };
  listeners.forEach((listener) => listener(progress));
}

export function previewUpdateStatus(): UpdateStatus {
  return updates;
}

export function previewUpdateSetAuto(on: boolean): UpdateStatus {
  updates = { ...updates, autoCheck: on };
  return updates;
}

export function previewUpdateCheck(): UpdateStatus {
  updates = { ...updates, lastChecked: Math.floor(Date.now() / 1000) };
  return updates;
}

/** Walks through the phases; the preview never restarts. */
export function previewUpdateInstall(): Promise<void> {
  return new Promise((_resolve, reject) => {
    let downloaded = 0;
    cancelled = () => {
      clearInterval(timer);
      setProgress(IDLE);
      reject("cancelled");
    };
    timer = setInterval(() => {
      downloaded = Math.min(TOTAL, downloaded + TOTAL / 20);
      if (downloaded < TOTAL) return setProgress({ phase: "downloading", downloaded, total: TOTAL });
      clearInterval(timer);
      setProgress({ phase: "verifying", downloaded, total: TOTAL });
      setTimeout(() => setProgress({ phase: "restarting", downloaded, total: TOTAL }), 600);
    }, 150);
  });
}

export function previewUpdateCancel(): void {
  cancelled?.();
}

export function onPreviewUpdateProgress(listener: (progress: UpdateProgress) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
