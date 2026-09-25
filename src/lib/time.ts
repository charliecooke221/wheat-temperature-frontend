import type { ChartGroup } from "../api/types";

export function parseApiTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [year, month] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "No scheduled reading yet";
  const date = parseApiTime(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatAge(value: string | null): string | null {
  const date = value ? parseApiTime(value) : null;
  if (!date) return null;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function formatTemperature(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}°`;
}

export function formatRange(group: ChartGroup): string {
  switch (group) {
    case "hour":
      return "Last 24 hours";
    case "day":
      return "Last 30 days";
    case "week":
      return "Last 12 weeks";
    case "month":
      return "Last 12 months";
  }
}

export function formatBucket(bucket: string, group: ChartGroup): { axis: string; full: string } {
  if (group === "week") {
    const match = /^(\d{4})-W(\d{1,2})$/.exec(bucket);
    if (!match) return { axis: bucket, full: bucket };
    const label = `Week ${Number(match[2])}, ${match[1]}`;
    return { axis: `W${match[2]}`, full: label };
  }

  const date = parseApiTime(bucket);
  if (!date) return { axis: bucket, full: bucket };

  if (group === "hour") {
    return {
      axis: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date),
      full: new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date),
    };
  }

  if (group === "month") {
    const full = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
    const axis = new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(date);
    return { axis, full };
  }

  return {
    axis: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date),
    full: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date),
  };
}

export function timeQualityLabel(quality: string | undefined): string | null {
  if (quality === "unsynced") return "Clock was not synced";
  if (quality === "rtc") return "Time kept by the hub clock";
  return null;
}
