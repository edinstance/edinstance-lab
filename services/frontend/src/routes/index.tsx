import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TopologyCanvas } from "../components/TopologyCanvas";
import { listApps, listDatabases } from "../platform/api";
import { topologyQueryKey } from "../platform/queryKeys";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data } = useQuery({
    queryKey: topologyQueryKey,
    queryFn: async () => {
      const [apps, databases] = await Promise.all([
        listApps(),
        listDatabases(),
      ]);
      return { apps, databases };
    },
    retry: false,
  });
  const apps = data?.apps ?? [];
  const databases = data?.databases ?? [];

  return (
    <main className="h-screen overflow-hidden bg-[#0d0b14] text-[#f4f1fa]">
      <TopologyCanvas apps={apps} databases={databases} readOnly />
    </main>
  );
}
