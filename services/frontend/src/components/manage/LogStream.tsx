import type { LogEntry } from "../../platform/api";

export function LogStream({ entries }: { entries: Array<LogEntry> }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#383141] bg-[#100e17]">
      <div className="grid grid-cols-[150px_220px_80px_1fr] gap-3 border-b border-[#2f2938] px-4 py-3 text-xs font-semibold tracking-[.11em] text-[#81798c] uppercase max-[900px]:grid-cols-[120px_1fr]">
        <span>Time</span>
        <span className="max-[900px]:hidden">Pod</span>
        <span className="max-[900px]:hidden">Level</span>
        <span>Message</span>
      </div>

      <div className="max-h-[520px] overflow-auto">
        {entries.length ? (
          entries.map((entry) => (
            <div
              className="grid grid-cols-[150px_220px_80px_1fr] gap-3 border-b border-[#24202b] px-4 py-3 font-mono text-xs text-[#d9d2e2] last:border-0 max-[900px]:grid-cols-[120px_1fr]"
              key={`${entry.timestamp}-${entry.pod}-${entry.message}`}
            >
              <time className="text-[#8f879e]">
                {formatTime(entry.timestamp)}
              </time>
              <span className="truncate text-[#aaa2b5] max-[900px]:hidden">
                {entry.pod || entry.container || entry.namespace}
              </span>
              <span className={levelClass(entry.level)}>
                {entry.level || "log"}
              </span>
              <span className="break-words whitespace-pre-wrap">
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

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelClass(level?: string) {
  switch (level) {
    case "error":
      return "text-[#fb7185]";
    case "warn":
      return "text-[#fbbf24]";
    case "info":
      return "text-[#79dfab]";
    case "debug":
      return "text-[#93c5fd]";
    default:
      return "text-[#81798c]";
  }
}
