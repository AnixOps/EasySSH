import type { SessionEvent, SessionHandle } from "./backend";
import { previewSnapshot } from "./preview";

const ESC = "\x1b";
const CRLF = "\r\n";
const color = (code: string, text: string) => `${ESC}[${code}m${text}${ESC}[0m`;

/** A fake session with local echo, so the terminal can be previewed and
 *  screenshotted without a backend. `exit` ends it to show that state. */
export function previewSession(
  hostId: string | null,
  onEvent: (event: SessionEvent) => void,
): SessionHandle {
  const host = previewSnapshot().hosts.find((entry) => entry.id === hostId)?.name ?? "local";
  const user = hostId ? "deploy" : "you";
  const prompt = `${color("1;32", `${user}@${host}`)}:${color("1;34", "~")}$ `;
  let line = "";
  let closed = false;
  const emit = (data: string) => {
    if (!closed) onEvent({ kind: "data", data });
  };
  const banner = hostId
    ? [
        "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)",
        "",
        "  System load:  0.08              Processes:       142",
        "  Usage of /:   37.2% of 78.12GB  Users logged in: 1",
        "  Memory usage: 41%               IPv4 address:    10.0.1.11",
        "",
        color("33", "3 updates can be applied immediately."),
        "Last login: Tue Oct 14 09:12:03 2026 from 192.168.1.20",
        "",
      ]
    : [];
  window.setTimeout(() => emit(banner.map((text) => text + CRLF).join("") + prompt), 120);

  const run = (command: string) => {
    if (command === "exit") {
      emit("logout" + CRLF);
      closed = true;
      onEvent({ kind: "exit", code: 0 });
      return;
    }
    if (command === "ls") {
      const entries = [color("1;34", "app"), color("1;34", "logs"), "deploy.sh", color("32", "start.sh"), "README.md"];
      emit(entries.join("  ") + CRLF);
    } else if (command) {
      emit(`${command.split(" ")[0]}: command not found${CRLF}`);
    }
    emit(prompt);
  };

  return {
    write(data) {
      for (const char of data) {
        if (char === "\r") {
          emit(CRLF);
          run(line.trim());
          line = "";
        } else if (char === "\x7f") {
          if (line) {
            line = line.slice(0, -1);
            emit("\b \b");
          }
        } else if (char >= " ") {
          line += char;
          emit(char);
        }
      }
    },
    resize() {},
    close() {
      closed = true;
    },
  };
}
