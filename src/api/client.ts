import type { AdminConfig, AdminConfigInput, ChartGroup, LayoutProbe, ProbeKind, Readings, Summary, SummaryProbe } from "./types";

const LIVE_API = "https://wheat-temperature-api.charliecooke221.workers.dev";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || LIVE_API).replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path: string, init?: RequestInit, token?: string): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "network", "Could not reach the temperature API.");
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const record = isRecord(body) ? body : null;
    const code = typeof record?.error === "string" ? record.error : "request_failed";
    const message = typeof record?.message === "string" ? record.message : `Request failed (${response.status}).`;
    throw new ApiError(response.status, code, message);
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseProbe(value: unknown): SummaryProbe | null {
  if (!isRecord(value)) return null;
  if (typeof value.probeId !== "string" || typeof value.label !== "string") return null;
  if (value.kind !== "grain" && value.kind !== "air") return null;
  const latest = isRecord(value.latest)
    ? {
        temperatureC: asNumber(value.latest.temperatureC),
        rawTemperatureC: asNumber(value.latest.rawTemperatureC),
        status: asString(value.latest.status) ?? "error",
        sampledAt: asString(value.latest.sampledAt),
        receivedAt: asString(value.latest.receivedAt) ?? "",
        sampleId: asString(value.latest.sampleId) ?? "",
        timeQuality: asString(value.latest.timeQuality) ?? "unsynced",
      }
    : null;

  const probe: SummaryProbe = {
    probeId: value.probeId,
    label: value.label,
    kind: value.kind,
    latest,
    min24hC: asNumber(value.min24hC),
    max24hC: asNumber(value.max24hC),
  };
  if (typeof value.row === "number") probe.row = value.row;
  if (typeof value.col === "number") probe.col = value.col;
  return probe;
}

export async function getSummary(): Promise<Summary> {
  const body = await request("/api/v1/summary");
  if (!isRecord(body) || !Array.isArray(body.probes)) {
    throw new ApiError(500, "invalid_response", "Summary response was not recognised.");
  }
  const probes = body.probes.map(parseProbe).filter((probe): probe is SummaryProbe => probe !== null);
  return {
    timezone: asString(body.timezone) ?? "Europe/London",
    stale: body.stale === true,
    staleAfterMinutes: asNumber(body.staleAfterMinutes) ?? 120,
    lastSampleAt: asString(body.lastSampleAt),
    probes,
    air: parseProbe(body.air),
  };
}

export async function getReadings(
  group: ChartGroup,
  includeManual: boolean,
  signal?: AbortSignal,
): Promise<Readings> {
  const params = new URLSearchParams({
    group,
    includeManual: includeManual ? "true" : "false",
  });
  const body = await request(`/api/v1/readings?${params}`, { signal });
  if (!isRecord(body) || !Array.isArray(body.points)) {
    throw new ApiError(500, "invalid_response", "Readings response was not recognised.");
  }

  const points = body.points.flatMap((point) => {
    if (!isRecord(point) || typeof point.bucket !== "string" || !isRecord(point.probes)) return [];
    const probes: Readings["points"][number]["probes"] = {};
    for (const [probeId, reading] of Object.entries(point.probes)) {
      if (!isRecord(reading)) continue;
      probes[probeId] = {
        avgC: asNumber(reading.avgC),
        minC: asNumber(reading.minC),
        maxC: asNumber(reading.maxC),
        count: asNumber(reading.count) ?? 0,
      };
    }
    const grain = isRecord(point.grain) ? point.grain : {};
    return [
      {
        bucket: point.bucket,
        probes,
        grain: {
          avgC: asNumber(grain.avgC),
          maxC: asNumber(grain.maxC),
        },
      },
    ];
  });

  const parsedGroup = body.group === "hour" || body.group === "week" || body.group === "month" ? body.group : "day";
  return {
    group: parsedGroup,
    includeManual: body.includeManual === true,
    start: asString(body.start) ?? "",
    end: asString(body.end) ?? "",
    probes: Array.isArray(body.probes) ? body.probes.filter((id): id is string => typeof id === "string") : [],
    points,
  };
}

function parseLayoutProbe(value: unknown): LayoutProbe | null {
  if (!isRecord(value)) return null;
  if (typeof value.probeId !== "string" || typeof value.label !== "string") return null;
  if (value.kind !== "grain" && value.kind !== "air") return null;
  const probe: LayoutProbe = {
    probeId: value.probeId,
    label: value.label,
    kind: value.kind as ProbeKind,
  };
  if (typeof value.row === "number") probe.row = value.row;
  if (typeof value.col === "number") probe.col = value.col;
  return probe;
}

function configSource(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  return isRecord(body.config) ? body.config : body;
}

export function parseAdminConfig(body: unknown): AdminConfig {
  const source = configSource(body);
  if (!source || !Array.isArray(source.probes)) {
    throw new ApiError(500, "invalid_response", "Admin settings were not recognised.");
  }
  const probes = source.probes.map(parseLayoutProbe).filter((probe): probe is LayoutProbe => probe !== null);
  const recipients = Array.isArray(source.emailRecipients)
    ? source.emailRecipients.filter((address): address is string => typeof address === "string")
    : [];
  return {
    alertThresholdC: asNumber(source.alertThresholdC) ?? 25,
    alertCooldownHours: asNumber(source.alertCooldownHours) ?? 24,
    alertsEnabled: source.alertsEnabled === true || source.alertsEnabled === 1,
    timezone: asString(source.timezone) ?? "Europe/London",
    emailRecipients: recipients,
    lastAlertAt: asString(source.lastAlertAt),
    updatedAt: asString(source.updatedAt),
    probes,
  };
}

export async function login(password: string): Promise<{ token: string; expiresAt?: string }> {
  const body = await request("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (!isRecord(body) || typeof body.token !== "string" || body.token.length === 0) {
    throw new ApiError(500, "invalid_response", "Login response did not include a token.");
  }
  return {
    token: body.token,
    expiresAt: asString(body.expiresAt) ?? undefined,
  };
}

export async function getAdminConfig(token: string): Promise<AdminConfig> {
  return parseAdminConfig(await request("/api/v1/admin/config", undefined, token));
}

export async function saveAdminConfig(token: string, draft: AdminConfigInput): Promise<AdminConfig | null> {
  const body = await request(
    "/api/v1/admin/config",
    {
      method: "PUT",
      body: JSON.stringify({
        alertThresholdC: draft.alertThresholdC,
        alertCooldownHours: draft.alertCooldownHours,
        alertsEnabled: draft.alertsEnabled,
        emailRecipients: draft.emailRecipients,
        probes: draft.probes,
      }),
    },
    token,
  );
  const nested = isRecord(body) && isRecord(body.config) ? body.config : null;
  const hasProbes = (isRecord(body) && Array.isArray(body.probes)) || (nested !== null && Array.isArray(nested.probes));
  if (!hasProbes) {
    return null;
  }
  return parseAdminConfig(body);
}

export async function sendTestAlert(token: string): Promise<string> {
  const body = await request(
    "/api/v1/admin/alert-test",
    { method: "POST", body: JSON.stringify({}) },
    token,
  );
  if (isRecord(body) && typeof body.message === "string") return body.message;
  return "Test alert sent.";
}
