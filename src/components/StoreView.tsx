import type { Summary, SummaryProbe } from "../api/types";
import { conditionLabel, placeGrainProbes, probeCondition, type ProbeCondition } from "../lib/probes";
import { formatAge, formatTimestamp, timeQualityLabel } from "../lib/time";

function temperatureBand(value: number): string {
  if (value >= 35) return "temp-35";
  if (value >= 30) return "temp-30";
  if (value >= 25) return "temp-25";
  if (value >= 20) return "temp-20";
  return "temp-low";
}

function ColoredTemp({ value, unit = "°" }: { value: number | null | undefined; unit?: string }) {
  if (typeof value !== "number") return "—";
  return (
    <span className={temperatureBand(value)}>
      {value.toFixed(1)}
      {unit === "°C" ? <span>°C</span> : "°"}
    </span>
  );
}

function RangeTemps({ min, max }: { min: number | null; max: number | null }) {
  if (min === null && max === null) return "—";
  return (
    <>
      <ColoredTemp value={min} /> – <ColoredTemp value={max} />
    </>
  );
}
function ProbeCard({ probe, condition }: { probe: SummaryProbe; condition: ProbeCondition }) {
  return (
    <article className={`probe ${condition}`}>
      <p className="probe-label">{probe.label}</p>
      <p className="probe-temp">
        <ColoredTemp value={probe.latest?.temperatureC} unit="°C" />
      </p>
      <p className="probe-range">
        <span className="range-label">24 h</span>
        <RangeTemps min={probe.min24hC} max={probe.max24hC} />
      </p>
      <p className="probe-status">{conditionLabel(condition)}</p>
    </article>
  );
}

export function StoreView({ summary }: { summary: Summary }) {
  const cells = placeGrainProbes(summary.probes);
  const air = summary.air ?? summary.probes.find((probe) => probe.kind === "air") ?? null;
  const airCondition = air ? probeCondition(air, summary.staleAfterMinutes, summary.stale) : "missing";
  const quality = timeQualityLabel(summary.probes.find((probe) => probe.latest)?.latest?.timeQuality);
  const age = formatAge(summary.lastSampleAt);

  return (
    <section className="store" aria-labelledby="store-heading">
      <div className="panel-head">
        <h2 id="store-heading">Grain store</h2>
        <div className="sample-meta">
          <p className="eyebrow">Last scheduled sample</p>
          <p className="sample-time">{formatTimestamp(summary.lastSampleAt)}</p>
          {age ? <p className="fine">{age}</p> : null}
          {quality ? <p className="fine">{quality}</p> : null}
        </div>
      </div>
      <div className="building">
        <div className={`air-strip ${airCondition}`}>
          <p className="probe-label">{air?.label ?? "Air"}</p>
          <p className="air-temp">
            <ColoredTemp value={air?.latest?.temperatureC} unit="°C" />
          </p>
          <p className="probe-range">
            <span className="range-label">24 h</span>
            <RangeTemps min={air?.min24hC ?? null} max={air?.max24hC ?? null} />
          </p>
          <p className="probe-status">{air ? conditionLabel(airCondition) : "No reading"}</p>
        </div>
        <div className="probe-grid">
          {cells.map((probe, index) => {
            if (!probe) {
              return (
                <article key={`empty-${index}`} className="probe missing">
                  <p className="probe-label">Empty</p>
                  <p className="probe-temp">—</p>
                  <p className="probe-status">No probe</p>
                </article>
              );
            }
            return (
              <ProbeCard
                key={probe.probeId}
                probe={probe}
                condition={probeCondition(probe, summary.staleAfterMinutes, summary.stale)}
              />
            );
          })}
        </div>
        <div className="building-sill" aria-hidden="true">
          <span />
          <span className="gap" />
          <span />
          <span className="gap" />
          <span />
        </div>
      </div>
    </section>
  );
}
