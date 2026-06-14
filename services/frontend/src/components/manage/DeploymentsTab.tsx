import { EmptyState } from "./EmptyState";
import { ServiceStat } from "./ServiceStat";
import type { PlatformApp } from "../../topology/topology";

export function DeploymentsTab({
  app,
  busy,
  onRedeploy,
  onViewLogs,
}: {
  app: PlatformApp;
  busy: boolean;
  onRedeploy: () => void;
  onViewLogs: () => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
        <ServiceStat
          good={app.ready}
          label="Status"
          value={app.ready ? "Online" : app.status}
        />
        <ServiceStat
          label="Replicas"
          value={`${app.ready ? app.replicas : "—"} / ${app.replicas}`}
        />
        <ServiceStat label="Port" value={String(app.port)} />
      </div>

      <section>
        <p className="section-label">Domains</p>
        <div className="grid gap-2">
          {app.domains.length ? (
            app.domains.map((domain) => (
              <a
                className="resource-row"
                href={`https://${domain.host}`}
                key={domain.host}
                rel="noreferrer"
                target="_blank"
              >
                <span className="flex-1">{domain.host}</span>
                <small>{domain.scope}</small>
              </a>
            ))
          ) : (
            <EmptyState text="No domains configured" />
          )}
        </div>
      </section>

      <section>
        <p className="section-label">Current deployment</p>
        <article
          className={`rounded-xl border p-5 ${
            app.ready
              ? "border-[#235b43] bg-[#10241b]"
              : "border-[#665126] bg-[#281f10]"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className={`status-pill ${app.ready ? "is-good" : ""}`}>
                {app.status}
              </span>
              <h3 className="mt-4 mb-1 text-lg font-medium">{app.image}</h3>
              <p className="m-0 text-sm text-[#91899f]">
                Updated {formatDate(app.updatedAt)}
              </p>
              {!app.ready && app.failureReason ? (
                <div className="mt-4 max-w-3xl rounded-lg border border-[#8a6530] bg-black/20 px-4 py-3">
                  <p className="m-0 text-xs font-semibold tracking-wide text-[#e9c46a] uppercase">
                    Failure reason
                  </p>
                  <pre className="mt-2 mb-0 overflow-x-auto whitespace-pre-wrap text-sm text-[#f3dfae]">
                    {app.failureReason}
                  </pre>
                </div>
              ) : null}
            </div>

            <div className="flex gap-3">
              {!app.ready ? (
                <button
                  className="secondary-action"
                  disabled={busy}
                  onClick={onRedeploy}
                  type="button"
                >
                  {busy ? "Redeploying…" : "Redeploy"}
                </button>
              ) : null}
              <button
                className="secondary-action"
                onClick={onViewLogs}
                type="button"
              >
                View logs
              </button>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "recently";

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}
