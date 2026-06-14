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
  return grafanaLogsFor({ namespace: "apps", app: service });
}

export function grafanaLogsFor({
  namespace,
  app,
}: {
  namespace: string;
  app: string;
}) {
  const url = new URL("/explore", env.grafanaUrl);
  const query = `{namespace="${escapeLokiString(namespace)}",app="${escapeLokiString(app)}"}`;
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

export function grafanaPlatformDashboard({
  dashboardUid,
  dashboardSlug,
  namespace,
  app,
}: {
  dashboardUid?: string;
  dashboardSlug?: string;
  namespace: string;
  app: string;
}) {
  if (dashboardUid && dashboardSlug) {
    return new URL(`/d/${dashboardUid}/${dashboardSlug}`, env.grafanaUrl)
      .toString();
  }

  const url = new URL("/explore", env.grafanaUrl);
  const panes = {
    metrics: {
      datasource: "prometheus",
      queries: [
        {
          refId: "A",
          expr: `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="${escapePrometheusString(namespace)}",pod=~"${escapePrometheusString(app)}-.*",container!="",container!="POD"}[5m]))`,
          legendFormat: "{{pod}} CPU",
        },
        {
          refId: "B",
          expr: `sum by (pod) (container_memory_working_set_bytes{namespace="${escapePrometheusString(namespace)}",pod=~"${escapePrometheusString(app)}-.*",container!="",container!="POD"})`,
          legendFormat: "{{pod}} memory",
        },
      ],
    },
  };

  url.searchParams.set("schemaVersion", "1");
  url.searchParams.set("panes", JSON.stringify(panes));

  return url.toString();
}

function escapeLokiString(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

function escapePrometheusString(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}
