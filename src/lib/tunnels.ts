import type { Tunnel } from "./backend";
import { t } from "./i18n";

/** "15432 → db.internal:5432", or "SOCKS 1080". */
export function describeTunnel(
  tunnel: Pick<Tunnel, "kind" | "bindAddress" | "bindPort" | "targetHost" | "targetPort">,
): string {
  const bind = tunnel.bindAddress ? `${tunnel.bindAddress}:${tunnel.bindPort}` : String(tunnel.bindPort);
  if (tunnel.kind === "dynamic") return `SOCKS ${bind}`;
  const target = `${tunnel.targetHost ?? ""}:${tunnel.targetPort ?? ""}`;
  return tunnel.kind === "local" ? `${bind} → ${target}` : `${t.remotePort} ${bind} → ${target}`;
}
