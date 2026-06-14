import { useEffect, useState } from "react";

import { getAppLogs } from "../../platform/api";
import { EmptyState } from "./EmptyState";
import { grafanaLogs } from "./grafana";
import { LogStream } from "./LogStream";
import { ServiceStat } from "./ServiceStat";
import type { PlatformApp } from "../../topology/topology";
import type { LogEntry } from "../../platform/api";

export function LogsTab({ app }: { app: PlatformApp }) {
  const [entries, setEntries] = useState<Array<LogEntry>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    void getAppLogs(app.name, { limit: 150 })
      .then((value) => {
        if (!cancelled) setEntries(value);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof Error ? caught.message : "Unable to load logs",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [app.name]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-3 gap-3 max-[700px]:grid-cols-1">
          <ServiceStat label="Service" value={app.name} />
          <ServiceStat label="Namespace" value="apps" />
          <ServiceStat label="Replicas" value={String(app.replicas)} />
        </div>

        <a
          className="secondary-action"
          href={grafanaLogs(app.name)}
          rel="noreferrer"
          target="_blank"
        >
          Open Grafana ↗
        </a>
      </div>

      {error ? <EmptyState text={error} /> : <LogStream entries={entries} />}
    </div>
  );
}
