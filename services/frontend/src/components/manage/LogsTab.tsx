import { useQuery } from "@tanstack/react-query";

import { getAppLogs } from "../../platform/api";
import { EmptyState } from "./EmptyState";
import { LogStream } from "./LogStream";
import type { PlatformApp } from "../../topology/topology";

export function LogsTab({ app }: { app: PlatformApp }) {
  const { data, error } = useQuery({
    queryKey: ["app-logs", app.name],
    queryFn: () => getAppLogs(app.name, { limit: 150 }),
    staleTime: 10_000,
  });

  if (error) {
    return (
      <EmptyState
        text={
          error instanceof Error ? error.message : "Unable to load logs"
        }
      />
    );
  }

  return (
    <div className="grid gap-5">
      <LogStream appName={app.name} entries={data ?? []} />
    </div>
  );
}
