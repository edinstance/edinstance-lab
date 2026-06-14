import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getAppLogs, getAppMetrics } from "../../platform/api";
import { grafanaLogsFor, grafanaPlatformDashboard } from "./grafana";
import { LogStream } from "./LogStream";
import { MetricChart } from "./MetricChart";
import { ServiceStat } from "./ServiceStat";
import type { TopologyNodeData } from "../../topology/types";

interface PlatformNodeDrawerProps {
  node: TopologyNodeData;
  onClose: () => void;
}

type PlatformTab = "overview" | "metrics" | "logs" | "settings";

const tabs: Array<PlatformTab> = ["overview", "metrics", "logs", "settings"];

export function PlatformNodeDrawer({ node, onClose }: PlatformNodeDrawerProps) {
  const [tab, setTab] = useState<PlatformTab>("overview");

  return (
    <aside className="absolute top-4 right-4 bottom-4 z-40 flex w-[min(1050px,calc(100vw-120px))] flex-col overflow-hidden rounded-2xl border border-[#3a3445] bg-[#15121d]/[.985] shadow-[-24px_0_80px_rgba(0,0,0,.45)] backdrop-blur-xl max-[800px]:inset-2 max-[800px]:w-auto">
      <header className="border-b border-[#312c3a] px-8 pt-7 max-[640px]:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-xs font-semibold tracking-[.16em] text-[#8f879e] uppercase">
              Platform infrastructure
            </p>
            <h2 className="mt-2 mb-0 text-3xl font-semibold tracking-[-.025em]">
              {node.title}
            </h2>
            <p className="mt-2 mb-0 text-sm text-[#8f879e]">{node.subtitle}</p>
          </div>
          <button
            aria-label="Close platform details"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-3xl text-[#91899f] hover:bg-white/5 hover:text-white"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <nav
          aria-label="Platform sections"
          className="mt-7 flex gap-8 overflow-x-auto"
        >
          {tabs.map((item) => (
            <button
              className={`border-b-2 pb-4 text-sm font-medium capitalize transition-colors ${
                tab === item
                  ? "border-[#a855f7] text-white"
                  : "border-transparent text-[#8f879e] hover:text-white"
              }`}
              key={item}
              onClick={() => setTab(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-[640px]:p-5">
        <PlatformTabContent node={node} tab={tab} />
      </div>
    </aside>
  );
}

function PlatformTabContent({
  node,
  tab,
}: {
  node: TopologyNodeData;
  tab: PlatformTab;
}) {
  switch (tab) {
    case "overview":
      return <PlatformOverview node={node} />;
    case "metrics":
      return <PlatformMetrics node={node} />;
    case "logs":
      return <PlatformLogs node={node} />;
    case "settings":
      return <PlatformSettings node={node} />;
  }
}

function PlatformOverview({ node }: { node: TopologyNodeData }) {
  const observability = node.observability;

  return (
    <div className="grid gap-6">
      <p className="m-0 text-base leading-7 text-[#c8c1d0]">{node.details}</p>

      <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
        <ServiceStat
          good={node.status === "active" || node.status === "ready"}
          label="Status"
          value={node.status ?? "unknown"}
        />
        <ServiceStat
          label="Namespace"
          value={observability?.namespace ?? node.facts.namespace ?? "system"}
        />
        <ServiceStat
          label="Workload"
          value={
            observability?.workloadName ?? observability?.app ?? node.title
          }
        />
      </div>

      <FactList facts={node.facts} />
    </div>
  );
}

function PlatformMetrics({ node }: { node: TopologyNodeData }) {
  const observability = node.observability;
  const app = observability?.app;
  const namespace = observability?.namespace;
  const [hours, setHours] = useState(6);
  const { data, error } = useQuery({
    enabled: Boolean(app && namespace),
    queryKey: ["platform-metrics", namespace, app, hours],
    queryFn: () => {
      if (!app || !namespace)
        throw new Error("No metrics target is configured for this node.");
      return getAppMetrics(app, hours, {
        namespace,
        app,
      });
    },
    staleTime: 15_000,
  });

  if (!observability)
    return (
      <Unavailable text="No metrics target is configured for this node." />
    );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-lg border border-[#40394b]">
          {[1, 6, 24, 168].map((value) => (
            <button
              className={`min-h-10 border-r border-[#40394b] px-4 text-sm last:border-0 ${
                hours === value
                  ? "bg-[#31243e] text-[#c084fc]"
                  : "bg-[#191620] text-[#91899f] hover:text-white"
              }`}
              key={value}
              onClick={() => setHours(value)}
              type="button"
            >
              {value === 168 ? "7d" : `${value}h`}
            </button>
          ))}
        </div>

        <a
          className="secondary-action"
          href={grafanaPlatformDashboard(observability)}
          rel="noreferrer"
          target="_blank"
        >
          Open Grafana ↗
        </a>
      </div>

      {error ? (
        <Unavailable
          text={
            error instanceof Error ? error.message : "Unable to load metrics"
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-5 max-[760px]:grid-cols-1">
          <MetricChart
            label="CPU"
            series={data?.series.cpu ?? []}
            unit="vCPU"
          />
          <MetricChart
            label="Memory"
            series={data?.series.memory ?? []}
            unit="bytes"
          />
        </div>
      )}
    </div>
  );
}

function PlatformLogs({ node }: { node: TopologyNodeData }) {
  const observability = node.observability;
  const app = observability?.app;
  const namespace = observability?.namespace;
  const { data, error } = useQuery({
    enabled: Boolean(app && namespace),
    queryKey: ["platform-logs", namespace, app],
    queryFn: () => {
      if (!app || !namespace)
        throw new Error("No log target is configured for this node.");
      return getAppLogs(app, {
        namespace,
        app,
        limit: 150,
      });
    },
    staleTime: 10_000,
  });

  if (!observability)
    return <Unavailable text="No log target is configured for this node." />;

  if (error) {
    return (
      <Unavailable
        text={
          error instanceof Error ? error.message : "Unable to load logs"
        }
      />
    );
  }

  return (
    <div className="grid gap-5">
      <LogStream
        appName={grafanaLogsFor(observability)}
        entries={data ?? []}
      />
    </div>
  );
}

function PlatformSettings({ node }: { node: TopologyNodeData }) {
  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-[#3a3445] bg-[#1a1722] p-5">
        <h3 className="m-0 text-lg font-semibold">GitOps managed</h3>
        <p className="mt-2 mb-0 text-sm leading-6 text-[#91899f]">
          Platform environment variables and deployment changes are controlled
          by Kubernetes manifests and secrets. They are intentionally separated
          from managed app controls.
        </p>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold tracking-[.12em] text-[#81798c] uppercase">
          Source
        </p>
        <div className="grid gap-2">
          {node.sources.map((source) => (
            <code
              className="block rounded-lg border border-[#332e3d] bg-[#100e17] px-4 py-3 text-sm text-[#c9a7f5]"
              key={source}
            >
              {source}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
}

function FactList({ facts }: { facts: Record<string, string | undefined> }) {
  return (
    <dl className="grid gap-3">
      {Object.entries(facts).map(([label, value]) =>
        value ? (
          <div
            className="grid grid-cols-[140px_1fr] gap-4 rounded-xl border border-[#332e3d] bg-[#1a1722] px-5 py-4 max-[520px]:grid-cols-1 max-[520px]:gap-1"
            key={label}
          >
            <dt className="text-xs font-semibold tracking-[.12em] text-[#81798c] uppercase">
              {label}
            </dt>
            <dd className="m-0 text-sm break-all text-[#eee9f3]">{value}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

function Unavailable({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[#3a3445] bg-[#1a1722] p-5 text-sm text-[#91899f]">
      {text}
    </div>
  );
}
