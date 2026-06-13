import { useEffect, useState } from "react";

import { getAppMetrics } from "../../platform/api";
import { EmptyState } from "./EmptyState";
import { grafanaDashboard } from "./grafana";
import type { PlatformApp } from "../../topology/topology";
import type { AppMetrics, MetricSeries } from "../../platform/api";

const chartColors = ["#a855f7", "#3b82f6", "#4ed08f", "#f59e0b"];
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

function MetricChart({
  label,
  series,
  unit,
}: {
  label: string;
  series: Array<MetricSeries>;
  unit: "vCPU" | "bytes";
}) {
  const points = series.flatMap((item) => item.values.map((point) => point[1]));
  const maxValue = Math.max(...points, 0.000001);

  return (
    <section className="rounded-xl border border-[#383141] bg-[#17141f] p-5">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="m-0 text-lg font-semibold">{label}</h3>
        <span className="text-xs text-[#777080]">Replicas</span>
      </div>

      <div className="relative h-64 overflow-hidden rounded-lg bg-[linear-gradient(rgba(88,78,102,.18)_1px,transparent_1px)] bg-[size:100%_25%]">
        <svg
          aria-label={`${label} usage by replica`}
          className="h-full w-full overflow-visible"
          preserveAspectRatio="none"
          role="img"
          viewBox="0 0 600 240"
        >
          {series.map((item, index) => (
            <polyline
              fill="none"
              key={item.pod}
              points={chartPoints(item.values, maxValue)}
              stroke={chartColors[index % chartColors.length]}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {!series.length ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-[#777080]">
            No samples yet
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {series.map((item, index) => (
          <span
            className="flex items-center gap-2 text-xs text-[#a49cac]"
            key={item.pod}
          >
            <i
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: chartColors[index % chartColors.length],
              }}
            />
            {item.pod} · {formatMetric(item.values.at(-1)?.[1] ?? 0, unit)}
          </span>
        ))}
      </div>
    </section>
  );
}

function chartPoints(values: Array<[number, number]>, maxValue: number) {
  if (values.length < 2) return "";

  const first = values[0][0];
  const span = Math.max(values.at(-1)![0] - first, 1);

  return values
    .map(
      ([time, value]) =>
        `${((time - first) / span) * 600},${232 - (value / maxValue) * 216}`,
    )
    .join(" ");
}

function formatMetric(value: number, unit: "vCPU" | "bytes") {
  if (unit === "vCPU") return `${value.toFixed(3)} vCPU`;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;

  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}
