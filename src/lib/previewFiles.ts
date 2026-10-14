import type {
  FilesHandle,
  RemoteFile,
  StartedTransfer,
  TransferEvent,
  TransferRequest,
} from "./backend";

/** An in-memory remote file system for browser previews and screenshots. */
const dir = (name: string, modified = "Oct 14 09:12"): RemoteFile => ({
  name,
  kind: "directory",
  size: 4096,
  modified,
  permissions: "drwxr-xr-x",
});
const file = (name: string, size: number, modified = "Oct 13 18:40"): RemoteFile => ({
  name,
  kind: "file",
  size,
  modified,
  permissions: "-rw-r--r--",
});

const tree: Record<string, RemoteFile[]> = {
  "/home/deploy": [
    dir("app"),
    dir("logs"),
    dir("releases", "Sep 30 22:05"),
    file(".bashrc", 3771, "Jan 3 2025"),
    file("deploy.sh", 2048),
    file("docker-compose.yml", 1820, "Oct 12 11:02"),
    file("README.md", 12034),
    file("backup-2026-10-13.tar.gz", 734003200, "Oct 13 03:00"),
  ],
  "/home/deploy/app": [dir("public"), dir("src"), file("package.json", 1544), file("server.js", 8812)],
  "/home/deploy/logs": [file("access.log", 52428800, "Oct 14 09:20"), file("error.log", 20480, "Oct 14 08:55")],
  "/home/deploy/releases": [dir("41", "Sep 23 10:00"), dir("42", "Sep 30 22:05")],
};

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function previewFiles(): FilesHandle {
  return {
    home: "/home/deploy",
    async list(path) {
      await delay(150);
      const entries = tree[path];
      if (!entries) throw new Error(`Can't ls: "${path}" not found`);
      return entries.map((entry) => ({ ...entry }));
    },
    async mkdir(path) {
      (tree[parentOf(path)] ??= []).push(dir(nameOf(path)));
      tree[path] = [];
    },
    async remove(path) {
      const siblings = tree[parentOf(path)] ?? [];
      tree[parentOf(path)] = siblings.filter((entry) => entry.name !== nameOf(path));
    },
    async rename(from, to) {
      const entry = tree[parentOf(from)]?.find((candidate) => candidate.name === nameOf(from));
      if (entry) entry.name = nameOf(to);
    },
    close() {},
  };
}

const timers = new Map<string, number>();
let nextTransfer = 1;

export async function previewTransfer(
  request: TransferRequest,
  onEvent: (event: TransferEvent) => void,
): Promise<StartedTransfer> {
  const id = `preview-${nextTransfer++}`;
  const remote = request.upload ? `${request.remote}/${nameOf(request.local ?? "file")}` : request.remote;
  const total = 734003200;
  let bytes = 0;
  const timer = window.setInterval(() => {
    bytes = Math.min(total, bytes + total / 6);
    if (request.upload || bytes >= total) {
      window.clearInterval(timer);
      timers.delete(id);
      if (request.upload) {
        const siblings = (tree[request.remote] ??= []);
        siblings.push(file(nameOf(remote), 18233, "Oct 14 09:30"));
      }
      onEvent({ kind: "done" });
    } else {
      onEvent({ kind: "progress", bytes });
    }
  }, 500);
  timers.set(id, timer);
  return { id, local: request.local ?? `/Users/you/Downloads/${nameOf(remote)}`, remote };
}

export async function previewCancel(id: string): Promise<void> {
  window.clearInterval(timers.get(id));
  timers.delete(id);
}
