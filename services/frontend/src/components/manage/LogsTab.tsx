import { useEffect, useState } from "react";

import { getAppLogs } from "../../platform/api";
import { EmptyState } from "./EmptyState";
import { LogStream } from "./LogStream";
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

  if (error) {
    return <EmptyState text={error} />;
  }

  return (
    <div className="grid gap-5">
      <LogStream appName={app.name} entries={entries} />
    </div>
  );
}
