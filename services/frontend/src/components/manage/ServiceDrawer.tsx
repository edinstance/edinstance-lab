import { DeploymentsTab } from "./DeploymentsTab";
import { LogsTab } from "./LogsTab";
import { MetricsTab } from "./MetricsTab";
import { SettingsTab } from "./SettingsTab";
import { VariablesTab } from "./VariablesTab";
import type { ManageController } from "./types";
import type { useManageController } from "./useManageController";
import type { PlatformApp } from "../../topology/topology";
import type { ChangeEvent } from "react";

export type ServiceTab =
  | "deployments"
  | "variables"
  | "metrics"
  | "logs"
  | "settings";

type Controller = ReturnType<typeof useManageController>;

const tabs: Array<ServiceTab> = [
  "deployments",
  "variables",
  "metrics",
  "logs",
  "settings",
];

interface ServiceDrawerProps {
  app: PlatformApp;
  controller: Controller;
  onClose: () => void;
  onDeleted: () => void;
  tab: ServiceTab;
  onTabChange: (tab: ServiceTab) => void;
}

export function ServiceDrawer({
  app,
  controller,
  onClose,
  onDeleted,
  tab,
  onTabChange,
}: ServiceDrawerProps) {
  const { state } = controller;
  const variables = state.envVars[app.name] ?? [];
  const busy = state.busyApp === app.name;

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    void controller.importEnv(app, event);
  }

  async function remove() {
    await controller.removeApp(app);
    onDeleted();
  }

  function selectTab(nextTab: ServiceTab) {
    onTabChange(nextTab);

    if (nextTab === "variables" && state.envApp !== app.name) {
      void controller.toggleEnvironment(app);
    }
  }

  return (
    <aside className="absolute top-4 right-4 bottom-4 z-40 flex w-[min(1050px,calc(100vw-120px))] flex-col overflow-hidden rounded-2xl border border-[#3a3445] bg-[#15121d]/[.985] shadow-[-24px_0_80px_rgba(0,0,0,.45)] backdrop-blur-xl max-[800px]:inset-2 max-[800px]:w-auto">
      <header className="border-b border-[#312c3a] px-8 pt-7 max-[640px]:px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="min-w-0">
              <h2 className="m-0 truncate text-3xl font-semibold tracking-[-.025em]">
                {app.name}
              </h2>
              <p className="mt-1 mb-0 truncate text-sm text-[#8f879e]">
                {app.image}
              </p>
            </div>
          </div>

          <button
            aria-label="Close service details"
            className="grid h-10 w-10 place-items-center rounded-lg text-3xl text-[#91899f] hover:bg-white/5 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <nav
          aria-label="Service sections"
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
              onClick={() => selectTab(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-[640px]:p-5">
        <ServiceTabContent
          app={app}
          busy={busy}
          controller={controller}
          importFile={importFile}
          onDelete={() => void remove()}
          onTabChange={onTabChange}
          tab={tab}
          variables={variables}
        />
      </div>
    </aside>
  );
}

function ServiceTabContent({
  app,
  busy,
  controller,
  importFile,
  onDelete,
  onTabChange,
  tab,
  variables,
}: {
  app: PlatformApp;
  busy: boolean;
  controller: ManageController;
  importFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onDelete: () => void;
  onTabChange: (tab: ServiceTab) => void;
  tab: ServiceTab;
  variables: ManageController["state"]["envVars"][string];
}) {
  switch (tab) {
    case "deployments":
      return (
        <DeploymentsTab app={app} onViewLogs={() => onTabChange("logs")} />
      );
    case "variables":
      return (
        <VariablesTab
          app={app}
          busy={busy}
          controller={controller}
          importFile={importFile}
          variables={variables}
        />
      );
    case "metrics":
      return <MetricsTab app={app} />;
    case "logs":
      return <LogsTab app={app} />;
    case "settings":
      return <SettingsTab app={app} busy={busy} onDelete={onDelete} />;
  }
}
