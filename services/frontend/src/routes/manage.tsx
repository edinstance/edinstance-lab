import { createFileRoute, Link } from "@tanstack/react-router";

import { CreateAppSection } from "../components/manage/CreateAppSection";
import { DatabaseSection } from "../components/manage/DatabaseSection";
import { ServicesSection } from "../components/manage/ServicesSection";
import { useManageController } from "../components/manage/useManageController";
import { buttonVariants } from "../components/ui/Button";

export const Route = createFileRoute("/manage")({ component: ManagePage });

function ManagePage() {
  const controller = useManageController();
  return (
    <main className="min-h-screen p-7">
      <header className="mx-auto mb-6 flex max-w-[1180px] items-end justify-between max-[860px]:grid max-[860px]:items-start max-[860px]:gap-4">
        <div><p className="mb-2 mt-0 font-mono text-[.68rem] font-black uppercase leading-none text-[#66736b]">platform control</p><h1 className="m-0 text-[1.8rem] leading-none">Services</h1></div>
        <Link className={`${buttonVariants({ variant: "outline" })} no-underline`} to="/">Service graph</Link>
      </header>
      <CreateAppSection state={controller.state} onSubmit={controller.createAppFromForm} />
      <DatabaseSection state={controller.state} onSubmit={controller.createDatabaseFromForm} />
      <ServicesSection state={controller.state} onDeleteApp={(app) => void controller.removeApp(app)} onImportEnv={(app, event) => void controller.importEnv(app, event)} onToggleEnvironment={(app) => void controller.toggleEnvironment(app)} onSaveEnvVar={(app, event) => void controller.saveEnvVar(app, event)} onDeleteEnvVar={(app, name) => void controller.removeEnvVar(app, name)} />
    </main>
  );
}
