import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, RotateCw, SquareArrowOutUpRight, Unplug, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { copyText, openExternal, openSession, pasteText, type SessionHandle } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { duration, ease, enter, leave } from "@/lib/motion";
import { onSettings, settings } from "@/lib/settings";
import { appShortcut } from "@/lib/shortcuts";
import { registerTerminal } from "@/lib/terminals";
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
      fontSize: settings().terminalFontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: settings().terminalScrollback,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.open(container);
    // Headless test browsers have no usable WebGL, so automation uses the DOM renderer.
    if (!navigator.webdriver) {
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        terminal.loadAddon(webgl);
      } catch {
        // The DOM renderer is the fallback when WebGL is unavailable.
      }
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
    const unregister = registerTerminal(tabKey, {
      send(text, run) {
        terminal.paste(text);
        if (run) sessionRef.current?.write("\r");
        terminal.focus();
      },
      connected: () => sessionRef.current !== null,
    });
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
    const stopSettings = onSettings((next) => {
      terminal.options.fontSize = next.terminalFontSize;
      terminal.options.scrollback = next.terminalScrollback;
      updateTheme();
      if (container.clientWidth > 0) fit.fit();
    });

    return () => {
      disposed = true;
      unregister();
      scheme.removeEventListener("change", updateTheme);
      stopSettings();
      observer.disconnect();
      sessionRef.current?.close();
      sessionRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [hostId, report, tabKey]);

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
    <div className="relative h-full min-w-0 flex-1 bg-bg">
      <div ref={containerRef} className="absolute inset-0 py-2 pl-3" />

      <AnimatePresence>
      {findOpen && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: duration.toggle, ease: ease.emphasized } }}
          exit={{ opacity: 0, y: -6, transition: leave }}
          className="material-bar absolute top-3 right-4 z-dropdown flex items-center gap-1 rounded-sm p-1 shadow-2 ring-1 ring-separator"
        >
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
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {status.state === "exited" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: enter }}
            exit={{ opacity: 0, y: 8, transition: leave }}
            className="pointer-events-auto flex max-w-xl flex-wrap items-center gap-3 rounded-md bg-bg-elevated px-4 py-3 shadow-3"
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
          </motion.div>
        </div>
      )}
      </AnimatePresence>
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
