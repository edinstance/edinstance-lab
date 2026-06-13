import { env } from "../../env";

export function grafanaDashboard(service: string) {
  const url = new URL(
    "/d/platform-applications/platform-applications",
    env.grafanaUrl,
  );

  url.searchParams.set("var-service", service);
  url.searchParams.set("var-pod", ".*");
  url.searchParams.set("var-container", ".*");

  return url.toString();
}

export function grafanaLogs(service: string) {
  const url = new URL("/explore", env.grafanaUrl);
  const query = `{namespace="apps",app="${escapeLokiString(service)}"}`;
  const panes = {
    service: {
      datasource: "loki",
      queries: [{ refId: "A", expr: query }],
    },
  };

  url.searchParams.set("schemaVersion", "1");
  url.searchParams.set("panes", JSON.stringify(panes));

  return url.toString();
}

function escapeLokiString(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}
