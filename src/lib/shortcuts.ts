/* App shortcuts must not collide with the shell: Ctrl+W, Ctrl+K and Ctrl+T
   all mean something in bash and vim. So the app uses Cmd on macOS and
   Ctrl+Shift elsewhere, like most terminal apps. */

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export type AppShortcut =
  | "search-hosts"
  | "new-local"
  | "close-tab"
  | "toggle-files"
  | "find"
  | "copy"
  | "paste";

const keys: Record<string, AppShortcut> = {
  k: "search-hosts",
  t: "new-local",
  w: "close-tab",
  e: "toggle-files",
  f: "find",
  c: "copy",
  v: "paste",
};

export function appShortcut(event: KeyboardEvent): AppShortcut | null {
  if (event.type !== "keydown" || event.altKey) return null;
  const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && event.shiftKey && !event.metaKey;
  if (!modifier) return null;
  const shortcut = keys[event.key.toLowerCase()] ?? null;
  // On macOS the native Cmd+C / Cmd+V already copy and paste in the terminal.
  if (isMac && (shortcut === "copy" || shortcut === "paste")) return null;
  return shortcut;
}

export function shortcutLabel(key: string): string {
  return isMac ? `⌘${key.toUpperCase()}` : `Ctrl+Shift+${key.toUpperCase()}`;
}
