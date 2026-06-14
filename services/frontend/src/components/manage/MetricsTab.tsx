import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getAppMetrics } from "../../platform/api";
import { EmptyState } from "./EmptyState";
import { grafanaDashboard } from "./grafana";
import { MetricChart } from "./MetricChart";
import type { PlatformApp } from "../../topology/topology";

const timeRanges = [1, 6, 24, 168];

export function MetricsTab({ app }: { app: PlatformApp }) {
  const [hours, setHours] = useState(6);
  const { data, error } = useQuery({
    queryKey: ["app-metrics", app.name, hours],
    queryFn: () => getAppMetrics(app.name, hours),
    staleTime: 15_000,
  });

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
        <EmptyState
          text={
            error instanceof Error ? error.message : "Unable to load metrics"
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-5 max-[760px]:grid-cols-1">
          <MetricChart
            label="CPU"
            series={data?.series.cpu ?? []}
            unit="vCPU"
          />
          <MetricChart
            label="Memory"
            series={data?.series.memory ?? []}
            unit="bytes"
          />
        </div>
      )}
    </div>
  );
}
