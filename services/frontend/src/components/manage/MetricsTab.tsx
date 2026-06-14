import { useEffect, useState } from "react";

import { getAppMetrics } from "../../platform/api";
import { EmptyState } from "./EmptyState";
import { grafanaDashboard } from "./grafana";
import { MetricChart } from "./MetricChart";
import type { PlatformApp } from "../../topology/topology";
import type { AppMetrics } from "../../platform/api";

const timeRanges = [1, 6, 24, 168];

export function MetricsTab({ app }: { app: PlatformApp }) {
  const [hours, setHours] = useState(6);
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setError(null);

    void getAppMetrics(app.name, hours)
      .then((value) => {
        if (!cancelled) setMetrics(value);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;

        setError(
          caught instanceof Error ? caught.message : "Unable to load metrics",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [app.name, hours]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-lg border border-[#40394b]">
          {timeRanges.map((value) => (
            <button
              className={`min-h-10 border-r border-[#40394b] px-4 text-sm last:border-0 ${
                hours === value
                  ? "bg-[#31243e] text-[#c084fc]"
                  : "bg-[#191620] text-[#91899f] hover:text-white"
              }`}
              key={value}
              onClick={() => setHours(value)}
              type="button"
            >
              {value === 168 ? "7d" : `${value}h`}
            </button>
          ))}
        </div>

        <a
          className="secondary-action"
          href={grafanaDashboard(app.name)}
          rel="noreferrer"
          target="_blank"
        >
          Open Grafana ↗
        </a>
      </div>

      {error ? (
        <EmptyState text={error} />
      ) : (
        <div className="grid grid-cols-2 gap-5 max-[760px]:grid-cols-1">
          <MetricChart
            label="CPU"
            series={metrics?.series.cpu ?? []}
            unit="vCPU"
          />
          <MetricChart
            label="Memory"
            series={metrics?.series.memory ?? []}
            unit="bytes"
          />
        </div>
      )}
    </div>
  );
}
