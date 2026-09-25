import { useEffect, useState } from "react";
import type { ChartGroup, SummaryProbe } from "../api/types";
import { ApiError, getReadings } from "../api/client";
import { formatBucket, formatRange, formatTemperature } from "../lib/time";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const GROUPS: { id: ChartGroup; label: string }[] = [
  { id: "hour", label: "Hourly" },
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

const GRAIN_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#59a14f",
  "#e15759",
  "#b07aa1",
  "#9c755f",
  "#d37295",
  "#557f8e",
  "#8f7c35",
];

interface ChartRow {
  label: string;
  fullLabel: string;
  grainAvg: number | null;
  grainMax: number | null;
  [probeId: string]: string | number | null;
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string | Array<number | string> | null;
  color?: string;
}

function chartDomain(rows: ChartRow[], keys: string[]): [number, number] {
  const values: number[] = [];
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "number") values.push(value);
    }
  }
  if (values.length === 0) return [0, 30];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.8, (max - min) * 0.25);
  return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10];
}

function grainColor(probeId: string): string {
  const match = /(\d+)$/.exec(probeId);
  const index = match ? Number(match[1]) - 1 : 0;
  return GRAIN_COLORS[index] ?? GRAIN_COLORS[0];
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      <p>{label}</p>
      <ul>
        {payload.map((entry) => {
          const value = Array.isArray(entry.value) ? entry.value[0] : entry.value;
          return (
            <li key={String(entry.dataKey)}>
              <span style={{ background: entry.color }} />
              <span>{entry.name}</span>
              <strong>{formatTemperature(typeof value === "number" ? value : null)}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TemperatureChart({ probes }: { probes: SummaryProbe[] }) {
  const [group, setGroup] = useState<ChartGroup>("day");
  const [hidden, setHidden] = useState<string[]>([]);
  const [rows, setRows] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const grains = probes.filter((probe) => probe.kind === "grain");
  const air = probes.find((probe) => probe.kind === "air") ?? null;

  useEffect(() => {
    setRows([]);
    setLoading(true);
  }, [group]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getReadings(group, false, controller.signal)
      .then((readings) => {
        if (controller.signal.aborted) return;
        setRows(
          readings.points.map((point) => {
            const labels = formatBucket(point.bucket, group);
            const row: ChartRow = {
              label: labels.axis,
              fullLabel: labels.full,
              grainAvg: point.grain.avgC,
              grainMax: point.grain.maxC,
            };
            for (const probe of probes) {
              row[probe.probeId] = point.probes[probe.probeId]?.avgC ?? null;
            }
            return row;
          }),
        );
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "Could not load the chart.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [group, probes]);

  function toggleProbe(probeId: string) {
    setHidden((current) => (current.includes(probeId) ? current.filter((id) => id !== probeId) : [...current, probeId]));
  }

  const plottedKeys = [
    ...grains.filter((probe) => !hidden.includes(probe.probeId)).map((probe) => probe.probeId),
    "grainAvg",
    "grainMax",
    ...(air ? [air.probeId] : []),
  ];
  const domain = chartDomain(rows, plottedKeys);

  return (
    <section className="panel chart-panel" aria-labelledby="chart-heading">
      <div className="panel-head">
        <div>
          <h2 id="chart-heading">Temperature history</h2>
          <p>{formatRange(group)}</p>
        </div>
        <div className="segmented" role="group" aria-label="Chart time range">
          {GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={group === item.id}
              className={group === item.id ? "is-selected" : undefined}
              onClick={() => setGroup(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && rows.length === 0 ? (
        <p className="muted-block" role="status">
          Loading chart…
        </p>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="muted-block">No readings in this range.</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="chart-frame" role="img" aria-label={`${formatRange(group)} temperature chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e6dccb" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#5c5348", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis
                tick={{ fill: "#5c5348", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={48}
                domain={domain}
                tickCount={4}
                tickFormatter={(value: number) => `${Number(value).toFixed(1)}°`}
              />
              <Tooltip
                content={(props) => {
                  const point = props.payload?.[0] as { payload?: ChartRow } | undefined;
                  return (
                    <ChartTooltip
                      active={props.active}
                      label={point?.payload?.fullLabel}
                      payload={props.payload as TooltipEntry[] | undefined}
                    />
                  );
                }}
              />
              {grains.map((probe) =>
                hidden.includes(probe.probeId) ? null : (
                  <Line
                    key={probe.probeId}
                    type="monotone"
                    dataKey={probe.probeId}
                    name={probe.label}
                    stroke={grainColor(probe.probeId)}
                    strokeWidth={1.5}
                    strokeOpacity={1}
                    dot={rows.length < 3}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ),
              )}
              <Line
                type="monotone"
                dataKey="grainAvg"
                name="Grain average"
                stroke="#1f1a14"
                strokeWidth={2.6}
                dot={rows.length < 3}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="grainMax"
                name="Grain maximum"
                stroke="#9c3b2e"
                strokeWidth={2.6}
                dot={rows.length < 3}
                connectNulls={false}
                isAnimationActive={false}
              />
              {air ? (
                <Line
                  type="monotone"
                  dataKey={air.probeId}
                  name={air.label}
                  stroke="#3d6d8c"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={rows.length < 3}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="chart-legend" role="group" aria-label="Chart lines">
        <span>
          <i style={{ background: "#1f1a14" }} />
          Grain average
        </span>
        <span>
          <i style={{ background: "#9c3b2e" }} />
          Grain maximum
        </span>
        {air ? (
          <span>
            <i className="air-swatch" />
            {air.label}
          </span>
        ) : null}
        {grains.map((probe) => {
          const visible = !hidden.includes(probe.probeId);
          return (
            <button
              key={probe.probeId}
              type="button"
              aria-pressed={visible}
              className={visible ? "is-on" : undefined}
              onClick={() => toggleProbe(probe.probeId)}
            >
              <i style={{ background: grainColor(probe.probeId) }} />
              {probe.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
