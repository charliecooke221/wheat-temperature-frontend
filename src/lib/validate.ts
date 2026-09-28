import type { AdminConfigInput, LayoutProbe } from "../api/types";
import { gridCells } from "./probes";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateConfig(draft: AdminConfigInput): string[] {
  const errors: string[] = [];
  const grains = draft.probes.filter((probe) => probe.kind === "grain");
  const airs = draft.probes.filter((probe) => probe.kind === "air");

  if (grains.length !== 9) errors.push("There must be nine grain probes.");
  if (airs.length !== 1) errors.push("Exactly one probe must be marked as air.");

  const positions = new Set<string>();
  for (const probe of grains) {
    if (!probe.label.trim()) errors.push(`${probe.probeId} needs a display label.`);
    if (
      probe.row === undefined ||
      probe.col === undefined ||
      !Number.isInteger(probe.row) ||
      !Number.isInteger(probe.col) ||
      probe.row < 0 ||
      probe.row > 2 ||
      probe.col < 0 ||
      probe.col > 2
    ) {
      errors.push(`${probe.probeId} must occupy one cell of the 3×3 grid.`);
      continue;
    }
    const key = `${probe.row},${probe.col}`;
    if (positions.has(key)) errors.push("Each grid position must be used once.");
    positions.add(key);
  }

  if (airs[0] && !airs[0].label.trim()) errors.push("The air probe needs a display label.");

  if (!Number.isFinite(draft.alertThresholdC) || draft.alertThresholdC < -10 || draft.alertThresholdC > 60) {
    errors.push("Alert threshold must be between −10 and 60 °C.");
  }
  if (
    !Number.isInteger(draft.alertCooldownHours) ||
    draft.alertCooldownHours < 1 ||
    draft.alertCooldownHours > 168
  ) {
    errors.push("Cooldown must be a whole number of hours from 1 to 168.");
  }

  const emails = draft.emailRecipients.map((address) => address.trim()).filter(Boolean);
  if (emails.some((address) => !EMAIL_RE.test(address))) {
    errors.push("Every recipient must be a valid email address.");
  }
  const folded = emails.map((address) => address.toLowerCase());
  if (new Set(folded).size !== folded.length) errors.push("Recipient addresses must be unique.");
  if (draft.alertsEnabled && emails.length === 0) {
    errors.push("Add at least one recipient before enabling alerts.");
  }

  return [...new Set(errors)];
}

export function ensureGrid(probes: LayoutProbe[]): LayoutProbe[] {
  const placed = new Map<string, LayoutProbe>();
  gridCells(probes).forEach((probe, index) => {
    if (probe) placed.set(probe.probeId, { ...probe, row: Math.floor(index / 3), col: index % 3 });
  });
  return probes.map((probe) => placed.get(probe.probeId) ?? probe);
}

export function swapGrainPositions(probes: LayoutProbe[], firstId: string, secondId: string): LayoutProbe[] {
  const first = probes.find((probe) => probe.probeId === firstId);
  const second = probes.find((probe) => probe.probeId === secondId);
  if (!first || !second || first.kind !== "grain" || second.kind !== "grain") return probes;
  return probes.map((probe) => {
    if (probe.probeId === firstId) return { ...probe, row: second.row, col: second.col };
    if (probe.probeId === secondId) return { ...probe, row: first.row, col: first.col };
    return probe;
  });
}
