import { useSyncExternalStore } from "react";
import { onUpdateEvents, updateStatus } from "./backend";
import { NO_UPDATES, type UpdateStatus } from "./update";

/* One copy of the update status for the whole window: the settings rows and
   the dot on the rail's Settings button. Loaded on first use, then kept up to
   date by the backend's events (install progress, a background check). */

/** `null` until the first answer, so nothing flashes "unavailable". */
let current: UpdateStatus | null = null;
let started = false;
const listeners = new Set<() => void>();

export function setUpdateStatus(next: UpdateStatus) {
  current = next;
  listeners.forEach((listener) => listener());
}

function start() {
  if (started) return;
  started = true;
  updateStatus()
    .then(setUpdateStatus)
    .catch(() => setUpdateStatus(NO_UPDATES));
  onUpdateEvents(
    (progress) => setUpdateStatus({ ...(current ?? NO_UPDATES), progress }),
    (status) => setUpdateStatus(status),
  );
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpdateStatus(): UpdateStatus | null {
  return useSyncExternalStore(subscribe, () => current);
}
