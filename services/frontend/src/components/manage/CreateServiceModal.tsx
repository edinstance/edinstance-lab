import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import type { SubmitEvent } from "react";
import type { useManageController } from "./useManageController";

type Controller = ReturnType<typeof useManageController>;

export function CreateServiceModal({
  controller,
  onClose,
  onCreated,
}: {
  controller: Controller;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { state } = controller;
  const update = (name: keyof typeof state.form, value: string) =>
    state.setForm((current) => ({ ...current, [name]: value }));

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = state.form.name.trim();
    const created = await controller.createAppFromForm(event);
    if (created && name) {
      onCreated(name);
      onClose();
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-[#07060a]/75 p-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-[680px] overflow-hidden rounded-2xl border border-[#40394f] bg-[#17141f] shadow-[0_28px_90px_rgba(0,0,0,.55)]">
        <header className="flex items-center justify-between border-b border-[#332e3e] px-6 py-5">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[.16em] text-[#887f99] uppercase">
              New resource
            </p>
            <h2 className="mt-1 mb-0 text-2xl font-semibold">
              Create a service
            </h2>
          </div>
          <button
            className="text-2xl text-[#91899f] hover:text-white"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <form
          className="grid grid-cols-2 gap-5 p-6 max-[640px]:grid-cols-1"
          onSubmit={(event) => void submit(event)}
        >
          <Field label="Service name">
            <Input
              autoFocus
              required
              pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?"
              placeholder="api-worker"
              value={state.form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>
          <Field label="Container port">
            <Input
              min="1"
              max="65535"
              required
              type="number"
              value={state.form.port}
              onChange={(e) => update("port", e.target.value)}
            />
          </Field>
          <Field
            className="col-span-2 max-[640px]:col-auto"
            label="Container image"
          >
            <Input
              required
              value={state.form.image}
              placeholder="ghcr.io/your-org/service:latest"
              onChange={(e) => update("image", e.target.value)}
            />
          </Field>
          <Field label="Replicas">
            <Input
              min="1"
              max="20"
              required
              type="number"
              value={state.form.replicas}
              onChange={(e) => update("replicas", e.target.value)}
            />
          </Field>
          <Field label="Domains">
            <Input
              value={state.form.domains}
              placeholder="service.edinstance.uk"
              onChange={(e) => update("domains", e.target.value)}
            />
          </Field>
          <div className="col-span-2 mt-2 flex justify-end gap-3 max-[640px]:col-auto">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={state.saving} type="submit">
              {state.saving ? "Creating…" : "Create service"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
