import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, RotateCw, SquareArrowOutUpRight, Unplug, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { copyText, openExternal, openSession, pasteText, type SessionHandle } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { appShortcut } from "@/lib/shortcuts";
import { terminalFont, terminalTheme } from "@/lib/terminalTheme";

export type SessionStatus =
  | { state: "connecting" }
  | { state: "connected" }
  | { state: "exited"; code: number | null; error?: string };

export function TerminalView({
  tabKey,
  hostId,
  active,
  onStatus,
}: {
  tabKey: string;
  hostId: string | null;
  active: boolean;
  onStatus: (key: string, status: SessionStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionRef = useRef<SessionHandle | null>(null);
  const startRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<SessionStatus>({ state: "connecting" });
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);

  const report = useCallback(
    (next: SessionStatus) => {
      setStatus(next);
      onStatus(tabKey, next);
    },
    [onStatus, tabKey],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    const terminal = new Terminal({
      fontFamily: terminalFont(),
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.open(container);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      // The DOM renderer is the fallback when WebGL is unavailable.
    }
    fit.fit();
    terminalRef.current = terminal;
    fitRef.current = fit;
    searchRef.current = search;

    terminal.attachCustomKeyEventHandler((event) => {
      const shortcut = appShortcut(event);
      if (!shortcut) return true;
      event.preventDefault();
      if (shortcut === "copy") {
        const selection = terminal.getSelection();
        if (selection) void copyText(selection);
      } else if (shortcut === "paste") {
        void pasteText().then((text) => text && terminal.paste(text));
      } else if (shortcut === "find") {
        setFindOpen(true);
        window.requestAnimationFrame(() => findInputRef.current?.select());
      }
      // Other shortcuts are handled by the app's window listener.
      return false;
    });
    terminal.onData((data) => sessionRef.current?.write(data));
    terminal.onResize(({ cols, rows }) => sessionRef.current?.resize(cols, rows));

    const start = () => {
      report({ state: "connecting" });
      let connected = false;
      openSession(hostId, terminal.cols, terminal.rows, (event) => {
        if (disposed) return;
        if (event.kind === "data") {
          terminal.write(event.data);
          if (!connected) {
            connected = true;
            report({ state: "connected" });
          }
        } else {
          sessionRef.current = null;
          report({ state: "exited", code: event.code });
        }
      })
        .then((session) => {
          if (disposed) session.close();
          else sessionRef.current = session;
        })
        .catch((reason) => {
          if (!disposed) report({ state: "exited", code: null, error: String(reason) });
        });
    };
    startRef.current = () => {
      terminal.write("\r\n");
      start();
      terminal.focus();
    };
    start();

    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();
    });
    observer.observe(container);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => (terminal.options.theme = terminalTheme());
    scheme.addEventListener("change", updateTheme);

    return () => {
      disposed = true;
      scheme.removeEventListener("change", updateTheme);
      observer.disconnect();
      sessionRef.current?.close();
      sessionRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [hostId, report]);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => {
      fitRef.current?.fit();
      terminalRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  const find = (forward: boolean) => {
    if (!query) return;
    if (forward) searchRef.current?.findNext(query);
    else searchRef.current?.findPrevious(query);
  };

  const closeFind = () => {
    setFindOpen(false);
    searchRef.current?.clearDecorations();
    terminalRef.current?.focus();
  };

  return (
    <div className="relative h-full bg-bg" hidden={!active}>
      <div ref={containerRef} className="absolute inset-0 py-2 pl-3" />

      {findOpen && (
        <div className="material-bar absolute top-3 right-4 z-dropdown flex items-center gap-1 rounded-sm p-1 shadow-2 ring-1 ring-separator">
          <Input
            ref={findInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") find(!event.shiftKey);
              if (event.key === "Escape") closeFind();
            }}
            placeholder={t.find}
            aria-label={t.find}
            className="h-7 w-52"
          />
          <IconButton label={t.findPrevious} onClick={() => find(false)}>
            <ChevronUp />
          </IconButton>
          <IconButton label={t.findNext} onClick={() => find(true)}>
            <ChevronDown />
          </IconButton>
          <IconButton label={t.closeFind} onClick={closeFind}>
            <X />
          </IconButton>
        </div>
      )}

      {status.state === "exited" && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
          <div
            role="status"
            className="flex max-w-xl animate-page-in flex-wrap items-center gap-3 rounded-md bg-bg-elevated px-4 py-3 shadow-3"
          >
            <Unplug className="size-5 shrink-0 text-label-2" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="text-callout font-medium text-label-1">
                {status.error ? t.sessionFailed : t.sessionEnded}
              </p>
              <p className="selectable truncate text-caption font-normal text-label-2">
                {status.error ?? (status.code === null ? "" : `${t.exitCode} ${status.code}`)}
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => startRef.current()}>
              <RotateCw />
              {hostId ? t.reconnect : t.reopen}
            </Button>
            {hostId && (
              <Button variant="secondary" size="sm" onClick={() => void openExternal(hostId)}>
                <SquareArrowOutUpRight />
                {t.openExternal}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
        {children}
      </Button>
    </Tooltip>
  );
}
