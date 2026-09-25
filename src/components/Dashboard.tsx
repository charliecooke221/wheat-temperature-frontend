import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ApiError, getSummary } from "../api/client";
import type { Summary } from "../api/types";
import { StoreView } from "./StoreView";

const TemperatureChart = lazy(() =>
  import("./TemperatureChart").then((module) => ({ default: module.TemperatureChart })),
);

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const next = await getSummary();
      setSummary(next);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not load the store.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading && !summary) {
    return (
      <div aria-busy="true">
        <div className="store skeleton" />
      </div>
    );
  }

  if (!summary) {
    return (
      <section className="panel empty-state">
        <h2>Store data is unavailable</h2>
        <p>{error ?? "The temperature API did not respond."}</p>
        <button type="button" className="button" onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <>
      {summary.stale ? (
        <p className="banner" role="status">
          Readings look stale. No scheduled sample has arrived in the last {summary.staleAfterMinutes} minutes.
        </p>
      ) : null}
      {error ? (
        <p className="banner quiet" role="status">
          Could not refresh: {error}
        </p>
      ) : null}
      <StoreView summary={summary} />
      <Suspense fallback={<div className="panel skeleton short" aria-label="Loading temperature history" />}>
        <TemperatureChart probes={summary.probes} />
      </Suspense>
    </>
  );
}
