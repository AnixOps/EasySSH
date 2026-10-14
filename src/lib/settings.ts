import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./backend";
import { readMirror, writeMirror, type LocaleSetting, type ThemeSetting } from "./prefsMirror";

export interface Settings {
  theme: ThemeSetting;
  locale: LocaleSetting;
  terminalFontSize: number;
  terminalScrollback: number;
}

const mirror = readMirror();
let current: Settings = { ...mirror, terminalFontSize: 13, terminalScrollback: 10000 };
const listeners = new Set<(settings: Settings) => void>();

/** `data-theme` overrides the system choice; none follows the system. */
function applyTheme(theme: ThemeSetting) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
applyTheme(current.theme);

function publish(next: Settings) {
  const localeChanged = next.locale !== readMirror().locale;
  current = next;
  writeMirror({ theme: next.theme, locale: next.locale });
  applyTheme(next.theme);
  for (const listener of listeners) listener(next);
  // Strings are chosen at start-up, so a new language needs a reload.
  if (localeChanged) window.location.reload();
}

export function settings(): Settings {
  return current;
}

export function onSettings(listener: (settings: Settings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadSettings(): Promise<void> {
  if (!isTauri) return;
  publish(await invoke<Settings>("settings_get"));
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const next = { ...current, ...patch };
  if (isTauri) await invoke("settings_save", { settings: next });
  publish(next);
}
