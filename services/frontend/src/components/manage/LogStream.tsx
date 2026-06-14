import { grafanaLogs } from "./grafana";
import type { LogEntry } from "../../platform/api";

export function LogStream({
  appName,
  entries,
}: {
  appName: string;
  entries: Array<LogEntry>;
}) {
  const counts = countLevels(entries);

  return (
    <section className="overflow-hidden rounded-xl border border-[#383141] bg-[#100e17]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2f2938] px-4 py-3">
        <div>
          <h3 className="m-0 text-base font-semibold">Recent log lines</h3>
          <p className="mt-1 mb-0 text-xs text-[#81798c]">
            Last six hours · newest first
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LogPill label="Errors" tone="error" value={counts.error} />
          <LogPill label="Warnings" tone="warn" value={counts.warn} />
          <LogPill label="Total" tone="neutral" value={entries.length} />
        </div>
        <a
          className="secondary-action"
          href={grafanaLogs(appName)}
          rel="noreferrer"
          target="_blank"
        >
          Open Grafana ↗
        </a>
      </div>

      <div className="grid grid-cols-[120px_minmax(150px,220px)_78px_1fr] gap-3 border-b border-[#2f2938] px-4 py-2 text-[0.68rem] font-semibold tracking-[.11em] text-[#81798c] uppercase max-[900px]:grid-cols-[92px_68px_1fr]">
        <span>Time</span>
        <span className="max-[900px]:hidden">Pod</span>
        <span>Level</span>
        <span>Message</span>
      </div>

      <div className="max-h-[560px] overflow-auto">
        {entries.length ? (
          entries.map((entry, index) => (
            <div
              className="grid grid-cols-[120px_minmax(150px,220px)_78px_1fr] gap-3 border-b border-[#24202b] px-4 py-2.5 font-mono text-xs text-[#d9d2e2] last:border-0 hover:bg-white/[.025] max-[900px]:grid-cols-[92px_68px_1fr]"
              key={`${entry.timestamp}-${entry.pod}-${index}`}
            >
              <time className="text-[#8f879e]">
                {formatTime(entry.timestamp)}
              </time>
              <span
                className="truncate text-[#aaa2b5] max-[900px]:hidden"
                title={entry.pod}
              >
                {shortPodName(entry.pod)}
              </span>
              <span className={levelClass(entry.level)}>
                {entry.level ?? "log"}
              </span>
              <span className="break-words whitespace-pre-wrap text-[#eee9f3]">
                {entry.message}
              </span>
            </div>
          ))
        ) : (
          <div className="grid min-h-64 place-items-center text-sm text-[#777080]">
            No log lines in the last six hours
          </div>
        )}
      </div>
    </section>
  );
}

function LogPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "error" | "warn" | "neutral";
  value: number;
}) {
  const toneClass =
    tone === "error"
      ? "border-[#7f1d2d] bg-[#33121a] text-[#fb7185]"
      : tone === "warn"
        ? "border-[#6d4d11] bg-[#2d220f] text-[#fbbf24]"
        : "border-[#3a3445] bg-[#1a1722] text-[#c8c1d0]";

  return (
    <span
      className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-3 text-xs ${toneClass}`}
    >
      <strong className="font-mono text-sm">{value}</strong>
      {label}
    </span>
  );
}

function countLevels(entries: Array<LogEntry>) {
  return entries.reduce(
    (counts, entry) => {
      if (entry.level === "error") counts.error += 1;
      if (entry.level === "warn") counts.warn += 1;
      return counts;
    },
    { error: 0, warn: 0 },
  );
}

function formatTime(timestamp: string | null | undefined) {
  if (!timestamp) return "Unknown";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelClass(level?: string) {
  const base =
    "inline-flex h-6 w-fit min-w-12 items-center justify-center rounded-md px-2 text-[0.68rem] font-semibold uppercase";
  switch (level) {
    case "error":
      return `${base} bg-[#3a111a] text-[#fb7185]`;
    case "warn":
      return `${base} bg-[#33260d] text-[#fbbf24]`;
    case "info":
      return `${base} bg-[#102d21] text-[#79dfab]`;
    case "debug":
      return `${base} bg-[#10243d] text-[#93c5fd]`;
    default:
      return `${base} bg-[#211d2a] text-[#aaa2b5]`;
  }
}

function shortPodName(pod: string) {
  return pod.replace(/^([a-z0-9-]+)-([a-f0-9]{8,10})-([a-z0-9]{5})$/, "$1-$3");
}
