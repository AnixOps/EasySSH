import type { ITheme } from "@xterm/xterm";

/* ANSI colours follow the AnixOps terminal palette (guidelines/terminal.md):
   red = danger, green = success, yellow = warning, blue = accent, muted =
   bright black; magenta and cyan come from the chart colours. Surfaces and
   text come from the live CSS tokens so the terminal matches the app. */
const ansi = {
  light: {
    black: "#1D1D1F",
    red: "#D70015",
    green: "#1A7F37",
    yellow: "#B25000",
    blue: "#4F5BE8",
    magenta: "#8B5CF6",
    cyan: "#0891B2",
    white: "#86868B",
    brightBlack: "#6E6E73",
    brightRed: "#B8000F",
    brightGreen: "#16A34A",
    brightYellow: "#A16207",
    brightBlue: "#4350DD",
    brightMagenta: "#DB2777",
    brightCyan: "#0E7490",
    brightWhite: "#3A3A3C",
  },
  dark: {
    black: "#48484A",
    red: "#FF453A",
    green: "#30D158",
    yellow: "#FF9F0A",
    blue: "#818CF8",
    magenta: "#A78BFA",
    cyan: "#22D3EE",
    white: "#D1D1D6",
    brightBlack: "#8E8E93",
    brightRed: "#FF6961",
    brightGreen: "#4ADE80",
    brightYellow: "#FACC15",
    brightBlue: "#949EFA",
    brightMagenta: "#F472B6",
    brightCyan: "#67E8F9",
    brightWhite: "#F5F5F7",
  },
} satisfies Record<string, ITheme>;

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function isDark(): boolean {
  return getComputedStyle(document.documentElement).colorScheme.includes("dark");
}

export function terminalTheme(): ITheme {
  return {
    ...(isDark() ? ansi.dark : ansi.light),
    background: token("--bg"),
    foreground: token("--label-1"),
    cursor: token("--accent"),
    cursorAccent: token("--bg"),
    selectionBackground: token("--accent-soft"),
  };
}

export function terminalFont(): string {
  return token("--font-mono") || "monospace";
}
