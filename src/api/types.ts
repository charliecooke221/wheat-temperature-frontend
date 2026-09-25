export type ProbeKind = "grain" | "air";
export type ChartGroup = "hour" | "day" | "week" | "month";

export interface ProbeLatest {
  temperatureC: number | null;
  rawTemperatureC: number | null;
  status: string;
  sampledAt: string | null;
  receivedAt: string;
  sampleId: string;
  timeQuality: string;
}

export interface SummaryProbe {
  probeId: string;
  label: string;
  kind: ProbeKind;
  row?: number;
  col?: number;
  latest: ProbeLatest | null;
  min24hC: number | null;
  max24hC: number | null;
}

export interface Summary {
  timezone: string;
  stale: boolean;
  staleAfterMinutes: number;
  lastSampleAt: string | null;
  probes: SummaryProbe[];
  air: SummaryProbe | null;
}

export interface ProbeAggregate {
  avgC: number | null;
  minC: number | null;
  maxC: number | null;
  count: number;
}

export interface ReadingsPoint {
  bucket: string;
  probes: Record<string, ProbeAggregate>;
  grain: {
    avgC: number | null;
    maxC: number | null;
  };
}

export interface Readings {
  group: ChartGroup;
  includeManual: boolean;
  start: string;
  end: string;
  probes: string[];
  points: ReadingsPoint[];
}

export interface LayoutProbe {
  probeId: string;
  label: string;
  kind: ProbeKind;
  row?: number;
  col?: number;
}

export interface AdminConfigInput {
  alertThresholdC: number;
  alertCooldownHours: number;
  alertsEnabled: boolean;
  emailRecipients: string[];
  probes: LayoutProbe[];
}

export interface AdminConfig extends AdminConfigInput {
  timezone: string;
  lastAlertAt: string | null;
  updatedAt: string | null;
}
