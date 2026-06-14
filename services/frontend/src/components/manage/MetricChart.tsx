import type { MetricSeries } from "../../platform/api";

const chartColors = [
  "#a855f7",
  "#3b82f6",
  "#4ed08f",
  "#f59e0b",
  "#f472b6",
  "#22d3ee",
];

const chartWidth = 640;
const chartHeight = 260;
const plotTop = 18;
const plotRight = 12;
const plotBottom = 34;
const plotLeft = 54;
const plotWidth = chartWidth - plotLeft - plotRight;
const plotHeight = chartHeight - plotTop - plotBottom;

export function MetricChart({
  label,
  series,
  unit,
}: {
  label: string;
  series: Array<MetricSeries>;
  unit: "vCPU" | "bytes";
}) {
  const prepared = prepareSeries(series);
  const points = prepared.flatMap((item) =>
    item.values.map((point) => point[1]),
  );
  const maxValue = niceMax(Math.max(...points, 0));
  const totalCurrent = prepared.reduce((sum, item) => sum + item.current, 0);
  const peak = Math.max(...points, 0);
  const [start, end] = timeRange(prepared);
  const visibleSeries = prepared.slice(0, 8);
  const hiddenCount = Math.max(prepared.length - visibleSeries.length, 0);
  const ticks = yTicks(maxValue);

  return (
    <section className="rounded-xl border border-[#383141] bg-[#15121d] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="m-0 text-lg font-semibold">{label}</h3>
          <p className="mt-1 mb-0 text-xs text-[#81798c]">
            {prepared.length} {prepared.length === 1 ? "pod" : "pods"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right">
          <SummaryStat label="Now" value={formatMetric(totalCurrent, unit)} />
          <SummaryStat label="Peak" value={formatMetric(peak, unit)} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-[#292431] bg-[#100e17]">
        <svg
          aria-label={`${label} usage by pod`}
          className="h-72 w-full"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <rect
            fill="transparent"
            height={plotHeight}
            width={plotWidth}
            x={plotLeft}
            y={plotTop}
          />
          {ticks.map((tick) => {
            const y = yForValue(tick, maxValue);
            return (
              <g key={tick}>
                <line
                  stroke="#282331"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  x1={plotLeft}
                  x2={chartWidth - plotRight}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="#8f879e"
                  fontSize="11"
                  textAnchor="end"
                  x={plotLeft - 10}
                  y={y + 4}
                >
                  {formatMetric(tick, unit)}
                </text>
              </g>
            );
          })}
          {visibleSeries.map((item, index) => (
            <polyline
              fill="none"
              key={item.pod}
              points={chartPoints(item.values, start, end, maxValue)}
              stroke={chartColors[index % chartColors.length]}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            stroke="#3a3445"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1={plotLeft}
            x2={chartWidth - plotRight}
            y1={chartHeight - plotBottom}
            y2={chartHeight - plotBottom}
          />
          <text fill="#8f879e" fontSize="11" x={plotLeft} y={chartHeight - 10}>
            {formatTime(start)}
          </text>
          <text
            fill="#8f879e"
            fontSize="11"
            textAnchor="end"
            x={chartWidth - plotRight}
            y={chartHeight - 10}
          >
            {formatTime(end)}
          </text>
        </svg>

        {!prepared.length ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-[#777080]">
            No samples yet
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        {visibleSeries.map((item, index) => (
          <div
            className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3 text-xs text-[#aaa2b5]"
            key={item.pod}
          >
            <i
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: chartColors[index % chartColors.length],
              }}
            />
            <span className="truncate">{shortPodName(item.pod)}</span>
            <span className="font-mono text-[#ded7e7]">
              {formatMetric(item.current, unit)}
            </span>
          </div>
        ))}
        {hiddenCount ? (
          <p className="m-0 text-xs text-[#81798c]">
            {hiddenCount} older {hiddenCount === 1 ? "pod" : "pods"} hidden from
            the chart
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="m-0 text-[0.65rem] font-semibold tracking-[.11em] text-[#777080] uppercase">
        {label}
      </p>
      <p className="m-0 font-mono text-sm text-[#eee9f3]">{value}</p>
    </div>
  );
}

function prepareSeries(series: Array<MetricSeries>) {
  return series
    .map((item) => ({
      ...item,
      current: item.values.at(-1)?.[1] ?? 0,
      lastTimestamp: item.values.at(-1)?.[0] ?? 0,
      peak: Math.max(...item.values.map((point) => point[1]), 0),
    }))
    .filter((item) => item.values.length >= 2)
    .sort((left, right) => {
      if (right.lastTimestamp !== left.lastTimestamp) {
        return right.lastTimestamp - left.lastTimestamp;
      }
      return right.peak - left.peak;
    });
}

function timeRange(series: ReturnType<typeof prepareSeries>): [number, number] {
  const timestamps = series.flatMap((item) =>
    item.values.map((point) => point[0]),
  );
  const start = Math.min(...timestamps, Date.now() / 1000);
  const end = Math.max(...timestamps, start + 1);
  return [start, end];
}

function chartPoints(
  values: Array<[number, number]>,
  start: number,
  end: number,
  maxValue: number,
) {
  const span = Math.max(end - start, 1);

  return values
    .map(([time, value]) => {
      const x = plotLeft + ((time - start) / span) * plotWidth;
      const y = yForValue(value, maxValue);
      return `${x},${y}`;
    })
    .join(" ");
}

function yForValue(value: number, maxValue: number) {
  return plotTop + plotHeight - (value / maxValue) * plotHeight;
}

function yTicks(maxValue: number) {
  return [maxValue, maxValue * 0.5, 0];
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function formatMetric(value: number, unit: "vCPU" | "bytes") {
  if (unit === "vCPU") {
    if (value < 0.01) return `${(value * 1000).toFixed(1)}m`;
    return `${value.toFixed(2)} vCPU`;
  }
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;

  return `${value.toFixed(0)} B`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortPodName(pod: string) {
  return pod.replace(/^([a-z0-9-]+)-([a-f0-9]{8,10})-([a-z0-9]{5})$/, "$1-$3");
}
