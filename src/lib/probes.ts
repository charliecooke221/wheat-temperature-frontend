import type { LayoutProbe, SummaryProbe } from "../api/types";
import { parseApiTime } from "./time";

export type ProbeCondition = "ok" | "stale" | "disconnected" | "error" | "missing";

// Judged on the probe's own latest reading (which may be manual); the dashboard banner covers a stalled schedule.
export function probeCondition(probe: SummaryProbe, staleAfterMinutes: number): ProbeCondition {
  if (!probe.latest) return "missing";
  if (probe.latest.status === "disconnected") return "disconnected";
  if (probe.latest.status !== "ok" || probe.latest.temperatureC === null) return "error";
  const stamp = probe.latest.sampledAt ?? probe.latest.receivedAt;
  const date = stamp ? parseApiTime(stamp) : null;
  const old = !date || Date.now() - date.getTime() > staleAfterMinutes * 60 * 1000;
  if (old) return "stale";
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

type GridProbe = Pick<LayoutProbe, "kind" | "row" | "col">;

/**
 * Places grain probes into the 3×3 grid, indexed row * 3 + col. Probes with a
 * missing, out-of-range or already-taken position fill the first free cells.
 */
export function gridCells<T extends GridProbe>(probes: T[]): Array<T | null> {
  const cells: Array<T | null> = Array.from({ length: 9 }, () => null);
  const unplaced: T[] = [];
  for (const probe of probes) {
    if (probe.kind !== "grain") continue;
    const { row, col } = probe;
    const validPosition =
      typeof row === "number" &&
      typeof col === "number" &&
      Number.isInteger(row) &&
      Number.isInteger(col) &&
      row >= 0 &&
      row <= 2 &&
      col >= 0 &&
      col <= 2;
    const index = validPosition ? row * 3 + col : -1;
    if (!validPosition || cells[index]) unplaced.push(probe);
    else cells[index] = probe;
  }
  for (const probe of unplaced) {
    const hole = cells.indexOf(null);
    if (hole === -1) break;
    cells[hole] = probe;
  }
  return cells;
}

