import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { TopologyCanvas } from "../components/TopologyCanvas";
import { listApps, listDatabases } from "../platform/api";
import type { PostgresDatabase } from "../platform/api";
import type { PlatformApp } from "../topology/topology";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [apps, setApps] = useState<Array<PlatformApp>>([]);
  const [databases, setDatabases] = useState<Array<PostgresDatabase>>([]);

  useEffect(() => {
    const request = { cancelled: false };

    void Promise.all([listApps(), listDatabases()])
      .then(([nextApps, nextDatabases]) => {
        if (!request.cancelled) {
          setApps(nextApps);
          setDatabases(nextDatabases);
        }
      })
      .catch(() => {
        if (!request.cancelled) {
          setApps([]);
          setDatabases([]);
        }
      });

    return () => {
      request.cancelled = true;
    };
  }, []);

  return (
    <main className="h-screen overflow-hidden bg-[#0d0b14] text-[#f4f1fa]">
      <TopologyCanvas apps={apps} databases={databases} readOnly />
    </main>
  );
}
