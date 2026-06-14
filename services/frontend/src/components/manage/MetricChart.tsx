import { useMemo } from "react";
import { Chart } from "react-charts";

import type { MetricSeries } from "../../platform/api";
import type { AxisOptions, ChartOptions, Datum, Series } from "react-charts";
import type { TooltipRendererProps } from "react-charts/types/components/TooltipRenderer";

const chartColors = [
  "#a855f7",
  "#3b82f6",
  "#4ed08f",
  "#f59e0b",
  "#f472b6",
  "#22d3ee",
];

interface MetricDatum {
  time: Date;
  value: number;
}

const chartPadding = {
  bottom: 28,
  left: 56,
  right: 14,
  top: 16,
};

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
  const visibleSeries = prepared.slice(0, 8);
  const hiddenCount = Math.max(prepared.length - visibleSeries.length, 0);
  const data = useMemo(
    () =>
      visibleSeries.map((item, index) => ({
        data: item.values
          .filter(([time, value]) => isFiniteMetricPoint(time, value))
          .map(([time, value]) => ({
            time: new Date(time * 1000),
            value,
          })),
        label: shortPodName(item.pod),
        color: chartColors[index % chartColors.length],
      })),
    [visibleSeries],
  );
  const primaryAxis = useMemo(
    (): AxisOptions<MetricDatum> => ({
      getValue: (datum) => datum.time,
      scaleType: "localTime",
      showGrid: false,
      formatters: {
        cursor: formatHoverTime,
        scale: formatTimeLabel,
        tooltip: formatHoverTime,
      },
    }),
    [],
  );
  const secondaryAxes = useMemo(
    (): Array<AxisOptions<MetricDatum>> => [
      {
        elementType: "line",
        getValue: (datum) => datum.value,
        hardMax: maxValue,
        hardMin: 0,
        scaleType: "linear",
        showDatumElements: "onFocus",
        showGrid: true,
        formatters: {
          cursor: (value) => formatMetric(value, unit),
          scale: (value) => formatMetric(value, unit),
          tooltip: (value) => formatMetric(value, unit),
        },
      },
    ],
    [maxValue, unit],
  );
  const chartOptions = useMemo(
    (): ChartOptions<MetricDatum> => ({
      data,
      dark: true,
      defaultColors: chartColors,
      getDatumStyle,
      getSeriesStyle,
      interactionMode: "primary",
      padding: {
        bottom: chartPadding.bottom,
        left: chartPadding.left,
        right: chartPadding.right,
        top: chartPadding.top,
      },
      primaryAxis,
      primaryCursor: {
        show: true,
        showLabel: false,
        showLine: true,
      },
      secondaryCursor: {
        show: false,
        showLabel: false,
        showLine: false,
      },
      secondaryAxes,
      showVoronoi: false,
      tooltip: {
        align: "right",
        groupingMode: "single",
        render: (props) => <MetricTooltip {...props} unit={unit} />,
      },
    }),
    [data, primaryAxis, secondaryAxes, unit],
  );

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
        <div className="h-72 w-full text-[#aaa2b5]">
          {prepared.length ? <Chart options={chartOptions} /> : null}
        </div>

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

function MetricTooltip({
  focusedDatum,
  getDatumStyle: getTooltipDatumStyle,
  unit,
}: TooltipRendererProps<MetricDatum> & { unit: "vCPU" | "bytes" }) {
  if (!focusedDatum) return null;

  const style = getTooltipDatumStyle(focusedDatum);

  return (
    <div className="min-w-56 rounded-lg border border-[#41394d] bg-[#17131f]/95 px-3 py-2 shadow-2xl shadow-black/30 backdrop-blur">
      <p className="m-0 mb-2 text-xs font-medium text-[#aaa2b5]">
        {formatHoverTime(focusedDatum.originalDatum.time)}
      </p>
      <div className="grid gap-1.5">
        <div className="grid grid-cols-[9px_minmax(7rem,1fr)_auto] items-center gap-2 text-xs">
          <i
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: String(style.color) }}
          />
          <span className="truncate text-[#c8c0d2]">
            {focusedDatum.seriesLabel}
          </span>
          <span className="font-mono text-[#f2edf7]">
            {formatMetric(Number(focusedDatum.secondaryValue ?? 0), unit)}
          </span>
        </div>
      </div>
    </div>
  );
}

function prepareSeries(series: Array<MetricSeries>) {
  return series
    .map((item) => {
      const values = item.values.filter(([time, value]) =>
        isFiniteMetricPoint(time, value),
      );

      return {
        ...item,
        values,
        current: values.at(-1)?.[1] ?? 0,
        lastTimestamp: values.at(-1)?.[0] ?? 0,
        peak: Math.max(...values.map((point) => point[1]), 0),
      };
    })
    .filter((item) => item.values.length >= 2)
    .sort((left, right) => {
      if (right.lastTimestamp !== left.lastTimestamp) {
        return right.lastTimestamp - left.lastTimestamp;
      }
      return right.peak - left.peak;
    });
}

function niceMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function formatMetric(value: unknown, unit: "vCPU" | "bytes") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return unit === "vCPU" ? "0.00 vCPU" : "0 B";
  }

  if (unit === "vCPU") {
    if (value < 0.01) return `${(value * 1000).toFixed(1)}m`;
    return `${value.toFixed(2)} vCPU`;
  }
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;

  return `${value.toFixed(0)} B`;
}

function formatTimeLabel(timestamp: unknown) {
  const date = coerceDate(timestamp);
  if (!date) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHoverTime(timestamp: unknown) {
  const date = coerceDate(timestamp);
  if (!date) return "Unknown time";

  return date.toLocaleString([], {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short",
  });
}

function coerceDate(value: unknown) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  return value;
}

function isFiniteMetricPoint(time: number, value: number) {
  return Number.isFinite(time) && Number.isFinite(value);
}

function getSeriesStyle(series: Series<MetricDatum>): React.CSSProperties & {
  line?: React.CSSProperties;
  circle?: React.CSSProperties;
} {
  const color = series.originalSeries.color ?? chartColors[0];

  return {
    color,
    line: {
      stroke: color,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2.4,
    },
  };
}

function getDatumStyle(datum: Datum<MetricDatum>): React.CSSProperties & {
  circle?: React.CSSProperties;
} {
  const color = datum.originalSeries.color ?? chartColors[0];

  return {
    color,
    circle: {
      fill: "#100e17",
      r: 4,
      stroke: color,
      strokeWidth: 2,
    },
  };
}

function shortPodName(pod: string) {
  return pod.replace(/^([a-z0-9-]+)-([a-f0-9]{8,10})-([a-z0-9]{5})$/, "$1-$3");
}
