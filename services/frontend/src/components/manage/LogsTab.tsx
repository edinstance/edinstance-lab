import { grafanaLogs } from "./grafana";
import { ServiceStat } from "./ServiceStat";
import type { PlatformApp } from "../../topology/topology";

export function LogsTab({ app }: { app: PlatformApp }) {
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
        <ServiceStat label="Service" value={app.name} />
        <ServiceStat label="Namespace" value="apps" />
        <ServiceStat label="Replicas" value={String(app.replicas)} />
      </div>

      <div className="grid min-h-[420px] place-items-center rounded-xl border border-[#352f41] bg-[radial-gradient(circle_at_50%_25%,rgba(139,92,246,.12),transparent_45%),#110f18] p-10 text-center">
        <div>
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-[#514563] bg-[#211b2d] text-2xl text-[#c084fc]">
            ›_
          </div>
          <h3 className="m-0 text-2xl font-semibold">Live container logs</h3>
          <p className="mx-auto mt-2 mb-6 max-w-md text-[#91899f]">
            stdout and stderr from every replica are collected by Alloy and
            searchable in Loki.
          </p>
          <a
            className="primary-action"
            href={grafanaLogs(app.name)}
            rel="noreferrer"
            target="_blank"
          >
            Open in Grafana ↗
          </a>
        </div>
      </div>
    </div>
  );
}
