import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CreateServiceModal } from "../components/manage/CreateServiceModal";
import { ManageNotification } from "../components/manage/ManageNotification";
import { ServiceDrawer } from "../components/manage/ServiceDrawer";
import { useManageController } from "../components/manage/useManageController";
import { TopologyCanvas } from "../components/TopologyCanvas";
import type { ServiceTab } from "../components/manage/ServiceDrawer";

export const Route = createFileRoute("/manage")({ component: ManagePage });

function ManagePage() {
  const controller = useManageController();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [tab, setTab] = useState<ServiceTab>("deployments");
  const [creating, setCreating] = useState(false);
  const selectedApp =
    controller.state.apps.find((app) => app.name === selectedName) ?? null;

  useEffect(() => {
    if (
      selectedName &&
      !controller.state.apps.some((app) => app.name === selectedName)
    )
      setSelectedName(null);
  }, [controller.state.apps, selectedName]);

  function selectService(name: string) {
    if (!controller.state.apps.some((app) => app.name === name)) return;
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
