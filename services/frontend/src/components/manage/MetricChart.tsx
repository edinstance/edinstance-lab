import { useMemo, useRef, useState } from "react";
import { Chart } from "react-charts";

import type { MetricSeries } from "../../platform/api";
import type {
  AxisOptions,
  ChartOptions,
  Datum,
  Series,
} from "react-charts";

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

interface ChartDataSeries {
  color: string;
  data: Array<MetricDatum>;
  label: string;
}

interface CurveContext {
  lineTo: (x: number, y: number) => void;
  moveTo: (x: number, y: number) => void;
}

interface LinearCurve {
  areaEnd: () => void;
  areaStart: () => void;
  lineEnd: () => void;
  lineStart: () => void;
  point: (x: number, y: number) => void;
}

type LinearCurveFactory = (context: CurveContext) => LinearCurve;

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
  const timeDomain = useMemo(() => getTimeDomain(data), [data]);
  const primaryAxis = useMemo(
    (): AxisOptions<MetricDatum> => ({
      getValue: (datum) => datum.time,
      hardMax: timeDomain ? new Date(timeDomain.max) : undefined,
      hardMin: timeDomain ? new Date(timeDomain.min) : undefined,
      scaleType: "localTime",
      showGrid: false,
      formatters: {
        cursor: formatHoverTime,
        scale: formatTimeLabel,
        tooltip: formatHoverTime,
      },
    }),
    [timeDomain],
  );
  const secondaryAxes = useMemo(
    (): Array<AxisOptions<MetricDatum>> => [
      {
        curve: linearCurve,
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
        show: false,
        showLabel: false,
        showLine: false,
      },
      secondaryCursor: {
        show: false,
        showLabel: false,
        showLine: false,
      },
      secondaryAxes,
      showVoronoi: false,
      tooltip: false,
    }),
    [data, primaryAxis, secondaryAxes],
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

      <div className="relative overflow-visible rounded-lg border border-[#292431] bg-[#100e17]">
        <div className="h-72 w-full text-[#aaa2b5]">
          {prepared.length ? <Chart options={chartOptions} /> : null}
        </div>
        {prepared.length && timeDomain ? (
          <MetricHoverOverlay
            data={data}
            timeDomain={timeDomain}
            unit={unit}
          />
        ) : null}

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

function MetricHoverOverlay({
  data,
  timeDomain,
  unit,
}: {
  data: Array<ChartDataSeries>;
  timeDomain: TimeDomain;
  unit: "vCPU" | "bytes";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  function updateHover(clientX: number, clientY: number) {
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    if (!container || !rect) return;

    const plotLeft = chartPadding.left;
    const plotRight = rect.width - chartPadding.right;
    const plotTop = chartPadding.top;
    const plotBottom = rect.height - chartPadding.bottom;
    const plotWidth = Math.max(plotRight - plotLeft, 1);
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x < plotLeft || x > plotRight || y < plotTop || y > plotBottom) {
      setHover(null);
      return;
    }

    const ratio = (x - plotLeft) / plotWidth;
    const timeMs = timeDomain.min + ratio * (timeDomain.max - timeDomain.min);
    const paths = Array.from(
      container.parentElement?.querySelectorAll<SVGPathElement>(
        ".Series path",
      ) ?? [],
    );
    const candidates = data
      .map((series, index) => {
        const candidate = interpolateSeries(series, timeMs);
        const point = pointOnPathAtClientX(paths[index], clientX, rect);

        return candidate && point
          ? {
              ...candidate,
              x: point.x,
              y: point.y,
            }
          : null;
      })
      .filter(
        (candidate): candidate is HoverPointCandidate => Boolean(candidate),
      );
    if (!candidates.length) {
      setHover(null);
      return;
    }

    const closest = candidates.sort(
      (left, right) => Math.abs(left.y - y) - Math.abs(right.y - y),
    )[0];
    if (Math.abs(closest.y - y) > 44) {
      setHover(null);
      return;
    }

    setHover({
      color: closest.color,
      label: closest.label,
      time: new Date(timeMs),
      value: closest.value,
      width: rect.width,
      x,
      y: closest.y,
    });
  }

  return (
    <div
      className="absolute inset-0 z-10"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(event) => updateHover(event.clientX, event.clientY)}
      ref={containerRef}
    >
      {hover ? (
        <>
          <div
            className="pointer-events-none absolute top-4 bottom-7 w-px bg-white/30"
            style={{ left: hover.x }}
          />
          <i
            className="pointer-events-none absolute z-20 h-3 w-3 rounded-full border-2 bg-[#100e17]"
            style={{
              borderColor: hover.color,
              left: hover.x,
              top: hover.y,
              transform: "translate(-50%, -50%)",
            }}
          />
          <div
            className="pointer-events-none absolute z-30 min-w-56 rounded-lg border border-[#41394d] bg-[#17131f]/95 px-3 py-2 shadow-2xl shadow-black/30 backdrop-blur"
            style={{
              left: hover.x + 280 > hover.width ? undefined : hover.x + 28,
              right: hover.x + 280 > hover.width ? 16 : undefined,
              top: tooltipTop(hover.y),
            }}
          >
            <p className="m-0 mb-2 text-xs font-medium text-[#aaa2b5]">
              {formatHoverTime(hover.time)}
            </p>
            <div className="grid grid-cols-[9px_minmax(7rem,1fr)_auto] items-center gap-2 text-xs">
              <i
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: hover.color }}
              />
              <span className="truncate text-[#c8c0d2]">{hover.label}</span>
              <span className="font-mono text-[#f2edf7]">
                {formatMetric(hover.value, unit)}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface HoverCandidate {
  color: string;
  label: string;
  value: number;
}

interface HoverPointCandidate extends HoverCandidate {
  x: number;
  y: number;
}

interface HoverState extends HoverPointCandidate {
  time: Date;
  width: number;
}

interface TimeDomain {
  max: number;
  min: number;
}

function getTimeDomain(data: Array<ChartDataSeries>) {
  const timestamps = data.flatMap((series) =>
    series.data.map((datum) => datum.time.getTime()),
  );
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }

  return { max, min };
}

function interpolateSeries(
  series: ChartDataSeries,
  timeMs: number,
): HoverCandidate | null {
  const points = series.data;
  if (points.length < 2) return null;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    const previousTime = previous.time.getTime();
    const nextTime = next.time.getTime();

    if (timeMs >= previousTime && timeMs <= nextTime) {
      const span = nextTime - previousTime;
      const ratio = span ? (timeMs - previousTime) / span : 0;
      return {
        color: series.color,
        label: series.label,
        value: previous.value + (next.value - previous.value) * ratio,
      };
    }
  }

  return null;
}

function pointOnPathAtClientX(
  path: SVGPathElement | undefined,
  clientX: number,
  containerRect: DOMRect,
) {
  if (!path) return null;

  const bounds = path.getBoundingClientRect();
  if (clientX < bounds.left || clientX > bounds.right) return null;

  const totalLength = path.getTotalLength();
  let low = 0;
  let high = totalLength;

  for (let step = 0; step < 18; step += 1) {
    const mid = (low + high) / 2;
    const point = pathPointToClient(path, mid);
    if (!point) return null;

    if (point.x < clientX) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const point = pathPointToClient(path, (low + high) / 2);
  if (!point) return null;

  return {
    x: point.x - containerRect.left,
    y: point.y - containerRect.top,
  };
}

function pathPointToClient(path: SVGPathElement, length: number) {
  const matrix = path.getScreenCTM();
  if (!matrix) return null;

  const point = path.getPointAtLength(length);
  return new DOMPoint(point.x, point.y).matrixTransform(matrix);
}

const noop = () => undefined;

const linearCurve: LinearCurveFactory = (context) => {
  let started = false;

  return {
    areaEnd: noop,
    areaStart: noop,
    lineEnd: noop,
    lineStart() {
      started = false;
    },
    point(x, y) {
      if (started) {
        context.lineTo(x, y);
        return;
      }

      context.moveTo(x, y);
      started = true;
    },
  };
};

function tooltipTop(y: number) {
  const estimatedHeight = 86;
  const offset = 26;
  const preferred = y > 118 ? y - estimatedHeight - offset : y + offset;
  return clamp(preferred, 12, 288 - estimatedHeight - 12);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

function getSeriesStyle(
  series: Series<MetricDatum>,
): React.CSSProperties & {
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

function getDatumStyle(
  datum: Datum<MetricDatum>,
): React.CSSProperties & {
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
