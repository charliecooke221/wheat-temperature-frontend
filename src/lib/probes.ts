import type { SummaryProbe } from "../api/types";
import { parseApiTime } from "./time";

export type ProbeCondition = "ok" | "stale" | "disconnected" | "error" | "missing";

export function probeCondition(
  probe: SummaryProbe,
  staleAfterMinutes: number,
  pageStale: boolean,
): ProbeCondition {
  if (!probe.latest) return "missing";
  if (probe.latest.status === "disconnected") return "disconnected";
  if (probe.latest.status !== "ok" || probe.latest.temperatureC === null) return "error";
  const stamp = probe.latest.sampledAt ?? probe.latest.receivedAt;
  const date = stamp ? parseApiTime(stamp) : null;
  const old = !date || Date.now() - date.getTime() > staleAfterMinutes * 60 * 1000;
  if (pageStale || old) return "stale";
  return "ok";
}

export function conditionLabel(condition: ProbeCondition): string {
  switch (condition) {
    case "ok":
      return "OK";
    case "stale":
      return "Stale";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
    case "missing":
      return "No reading";
  }
}

export function placeGrainProbes(probes: SummaryProbe[]): Array<SummaryProbe | null> {
  const cells: Array<SummaryProbe | null> = Array.from({ length: 9 }, () => null);
  const unplaced: SummaryProbe[] = [];
  for (const probe of probes) {
    if (probe.kind !== "grain") continue;
    const row = probe.row;
    const col = probe.col;
    const index = row !== undefined && col !== undefined ? row * 3 + col : -1;
    if (row === undefined || col === undefined || row < 0 || row > 2 || col < 0 || col > 2 || cells[index]) {
      unplaced.push(probe);
      continue;
    }
    cells[index] = probe;
  }
  for (const probe of unplaced) {
    const hole = cells.indexOf(null);
    if (hole === -1) break;
    cells[hole] = probe;
  }
  return cells;
}

