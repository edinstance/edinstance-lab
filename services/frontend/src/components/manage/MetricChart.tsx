import type { MetricSeries } from "../../platform/api";

const chartColors = ["#a855f7", "#3b82f6", "#4ed08f", "#f59e0b"];

export function MetricChart({
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
        <span className="text-xs text-[#777080]">Pods</span>
      </div>

      <div className="relative h-64 overflow-hidden rounded-lg bg-[linear-gradient(rgba(88,78,102,.18)_1px,transparent_1px)] bg-[size:100%_25%]">
        <svg
          aria-label={`${label} usage by pod`}
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
