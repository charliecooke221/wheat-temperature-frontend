import { useEffect, useMemo, useState } from "react";
import type { ChartGroup, Readings, SummaryProbe } from "../api/types";
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

// Checked with the dataviz palette validator against the panel surface (#fffdf8):
// adjacent pairs stay distinguishable under colour-blindness simulation.
const GRAIN_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
  "#0f8fa3",
];

const AVG_COLOR = "#1f1a14";
const MAX_COLOR = "#9c3b2e";
const AIR_COLOR = "#3d6d8c";

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

const TICK_STEPS = [1, 2, 5, 10, 20];

// Whole-degree y-axis: pads the data range, then snaps both ends to a step that gives at most six gaps.
function chartScale(rows: ChartRow[], keys: string[]): { domain: [number, number]; ticks: number[] } {
  const values: number[] = [];
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "number") values.push(value);
    }
  }
  if (values.length === 0) return { domain: [0, 30], ticks: [0, 10, 20, 30] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.5, (max - min) * 0.1);
  const span = max - min + pad * 2;
  const step = TICK_STEPS.find((candidate) => span / candidate <= 6) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const low = Math.floor((min - pad) / step) * step;
  const high = Math.ceil((max + pad) / step) * step;
  const ticks: number[] = [];
  for (let tick = low; tick <= high; tick += step) ticks.push(tick);
  return { domain: [low, high], ticks };
}

function grainColor(probeId: string): string {
  const match = /(\d+)$/.exec(probeId);
  const index = match ? Number(match[1]) - 1 : 0;
  return GRAIN_COLORS[index] ?? GRAIN_COLORS[0];
}

function entryValue(entry: TooltipEntry): number | null {
  const value = Array.isArray(entry.value) ? entry.value[0] : entry.value;
  return typeof value === "number" ? value : null;
}

function TooltipRow({ entry }: { entry: TooltipEntry }) {
  return (
    <li>
      <span style={{ background: entry.color }} />
      <span>{entry.name}</span>
      <strong>{formatTemperature(entryValue(entry))}</strong>
    </li>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  mainKeys,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  mainKeys: string[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const main = mainKeys.flatMap((key) => payload.filter((entry) => String(entry.dataKey) === key));
  const probes = payload
    .filter((entry) => !mainKeys.includes(String(entry.dataKey)))
    .sort((a, b) => (entryValue(b) ?? -Infinity) - (entryValue(a) ?? -Infinity));
  return (
    <div className="chart-tooltip">
      <p>{label}</p>
      <ul className="tooltip-main">
        {main.map((entry) => (
          <TooltipRow key={String(entry.dataKey)} entry={entry} />
        ))}
      </ul>
      {probes.length > 0 ? (
        <ul className="tooltip-probes">
          {probes.map((entry) => (
            <TooltipRow key={String(entry.dataKey)} entry={entry} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TemperatureChart({ probes }: { probes: SummaryProbe[] }) {
  const [group, setGroup] = useState<ChartGroup>("day");
  const [hidden, setHidden] = useState<string[]>([]);
  const [readings, setReadings] = useState<Readings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const grains = probes.filter((probe) => probe.kind === "grain");
  const air = probes.find((probe) => probe.kind === "air") ?? null;

  // Readings are hourly, so the chart fetches only when the range changes, not on each summary refresh.
  useEffect(() => {
    const controller = new AbortController();
    setReadings(null);
    setLoading(true);
    getReadings(group, false, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setReadings(next);
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
  }, [group]);

  const rows = useMemo<ChartRow[]>(() => {
    if (!readings) return [];
    return readings.points.map((point) => {
      const labels = formatBucket(point.bucket, readings.group);
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
    });
  }, [readings, probes]);

  function toggleProbe(probeId: string) {
    setHidden((current) => (current.includes(probeId) ? current.filter((id) => id !== probeId) : [...current, probeId]));
  }

  const plottedKeys = [
    ...grains.filter((probe) => !hidden.includes(probe.probeId)).map((probe) => probe.probeId),
    "grainAvg",
    "grainMax",
    ...(air ? [air.probeId] : []),
  ];
  const scale = chartScale(rows, plottedKeys);
  const mainKeys = ["grainAvg", "grainMax", ...(air ? [air.probeId] : [])];

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
                domain={scale.domain}
                ticks={scale.ticks}
                tickFormatter={(value: number) => `${value}°`}
              />
              <Tooltip
                content={(props) => {
                  const point = props.payload?.[0] as { payload?: ChartRow } | undefined;
                  return (
                    <ChartTooltip
                      active={props.active}
                      label={point?.payload?.fullLabel}
                      payload={props.payload as TooltipEntry[] | undefined}
                      mainKeys={mainKeys}
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
                    strokeWidth={1}
                    strokeOpacity={0.75}
                    dot={rows.length < 3}
                    activeDot={{ r: 2.5, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ),
              )}
              <Line
                type="monotone"
                dataKey="grainAvg"
                name="Grain average"
                stroke={AVG_COLOR}
                strokeWidth={3.2}
                dot={rows.length < 3}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="grainMax"
                name="Grain maximum"
                stroke={MAX_COLOR}
                strokeWidth={3.2}
                dot={rows.length < 3}
                connectNulls={false}
                isAnimationActive={false}
              />
              {air ? (
                <Line
                  type="monotone"
                  dataKey={air.probeId}
                  name={air.label}
                  stroke={AIR_COLOR}
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

      <div className="chart-legend">
        <div className="legend-main">
          <span>
            <i style={{ background: AVG_COLOR }} />
            Grain average
          </span>
          <span>
            <i style={{ background: MAX_COLOR }} />
            Grain maximum
          </span>
          {air ? (
            <span>
              <i className="air-swatch" />
              {air.label}
            </span>
          ) : null}
        </div>
        <div className="legend-probes" role="group" aria-label="Grain probe lines">
          <span className="legend-heading">Probes</span>
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
      </div>
    </section>
  );
}
