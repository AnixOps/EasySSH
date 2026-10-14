/* A per-device copy of the appearance settings, read before the first paint
   so the app does not flash the default theme or language. The saved
   configuration stays the source of truth. */

export type ThemeSetting = "system" | "light" | "dark";
export type LocaleSetting = "system" | "en" | "zh_cn";

export interface AppearanceMirror {
  theme: ThemeSetting;
  locale: LocaleSetting;
}

const KEY = "anixops-ssh:appearance";

export function readMirror(): AppearanceMirror {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AppearanceMirror>;
    return { theme: parsed.theme ?? "system", locale: parsed.locale ?? "system" };
  } catch {
    return { theme: "system", locale: "system" };
  }
}

export function writeMirror(value: AppearanceMirror): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the configuration still has the value.
  }
}
