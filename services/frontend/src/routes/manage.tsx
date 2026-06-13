import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CreateServiceModal } from "../components/manage/CreateServiceModal";
import { ManageNotification } from "../components/manage/ManageNotification";
import { PlatformNodeDrawer } from "../components/manage/PlatformNodeDrawer";
import { ServiceDrawer } from "../components/manage/ServiceDrawer";
import { useManageController } from "../components/manage/useManageController";
import { TopologyCanvas } from "../components/TopologyCanvas";
import type { ServiceTab } from "../components/manage/ServiceDrawer";
import type { TopologyNodeData } from "../topology/types";

const platformNodes: Partial<Record<string, TopologyNodeData>> = {
  "platform-frontend": {
    title: "Platform frontend",
    subtitle: "TanStack Start",
    details: "The authenticated management UI and service graph.",
    category: "system",
    status: "active",
    facts: { public: "ui.edinstance.uk", local: "ui.local.edinstance.uk" },
    sources: ["services/frontend"],
  },
  "platform-api": {
    title: "Platform API",
    subtitle: "Go control plane",
    details: "Stores desired state and reconciles managed workloads.",
    category: "system",
    status: "active",
    facts: { public: "api.edinstance.uk", namespace: "platform-system" },
    sources: ["services/platform-api"],
  },
  "platform-db": {
    title: "Platform PostgreSQL",
    subtitle: "3 instances + PgBouncer",
    details:
      "CloudNativePG database backing platform state and authentication.",
    category: "system",
    status: "active",
    facts: { version: "17", storage: "20Gi Longhorn" },
    sources: ["kubernetes/platform/database"],
  },
};

export const Route = createFileRoute("/manage")({ component: ManagePage });

function ManagePage() {
  const controller = useManageController();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [tab, setTab] = useState<ServiceTab>("deployments");
  const [creating, setCreating] = useState(false);
  const selectedApp =
    controller.state.apps.find((app) => app.name === selectedName) ?? null;
  const selectedPlatformNode = selectedName
    ? platformNodes[selectedName]
    : null;

  useEffect(() => {
    if (
      selectedName &&
      !platformNodes[selectedName] &&
      !controller.state.apps.some((app) => app.name === selectedName)
    )
      setSelectedName(null);
  }, [controller.state.apps, selectedName]);

  function selectService(name: string) {
    if (
      !platformNodes[name] &&
      !controller.state.apps.some((app) => app.name === name)
    )
      return;
    setSelectedName(name);
    setTab("deployments");
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#0d0b14] text-[#f4f1fa]">
      <TopologyCanvas
        apps={controller.state.apps}
        loading={controller.state.loading}
        selectedNodeId={selectedName}
        onAdd={() => setCreating(true)}
        onSelect={selectService}
      />

      {controller.state.error ? (
        <ManageNotification kind="error" message={controller.state.error} />
      ) : null}

      {controller.state.notice ? (
        <ManageNotification kind="notice" message={controller.state.notice} />
      ) : null}

      {selectedApp ? (
        <ServiceDrawer
          app={selectedApp}
          controller={controller}
          onClose={() => setSelectedName(null)}
          onDeleted={() => setSelectedName(null)}
          onTabChange={setTab}
          tab={tab}
        />
      ) : null}

      {selectedPlatformNode ? (
        <PlatformNodeDrawer
          node={selectedPlatformNode}
          onClose={() => setSelectedName(null)}
        />
      ) : null}

      {creating ? (
        <CreateServiceModal
          controller={controller}
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            setSelectedName(name);
          }}
        />
      ) : null}
    </main>
  );
}
