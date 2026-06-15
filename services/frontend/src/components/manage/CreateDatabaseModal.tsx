import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import type { SubmitEvent } from "react";
import type { DatabaseForm } from "./types";
import type { useManageController } from "./useManageController";

type Controller = ReturnType<typeof useManageController>;

export function CreateDatabaseModal({
  controller,
  onClose,
}: {
  controller: Controller;
  onClose: () => void;
}) {
  const { state } = controller;
  const form = state.databaseForm;
  const update = <TKey extends keyof DatabaseForm>(
    name: TKey,
    value: DatabaseForm[TKey],
  ) => state.setDatabaseForm((current) => ({ ...current, [name]: value }));

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    const created = await controller.createDatabaseFromForm(event);
    if (created) onClose();
  }

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-[#07060a]/75 p-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="max-h-[calc(100vh-40px)] w-full max-w-[900px] overflow-hidden rounded-2xl border border-[#40394f] bg-[#17141f] shadow-[0_28px_90px_rgba(0,0,0,.55)]">
        <header className="flex items-center justify-between border-b border-[#332e3e] px-6 py-5">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[.16em] text-[#887f99] uppercase">
              New resource
            </p>
            <h2 className="mt-1 mb-0 text-2xl font-semibold">
              Create PostgreSQL
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
          className="grid max-h-[calc(100vh-160px)] grid-cols-4 gap-5 overflow-y-auto p-6 max-[860px]:grid-cols-1"
          onSubmit={(event) => void submit(event)}
        >
          <Field label="Name / DNS prefix">
            <Input
              autoFocus
              required
              pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?"
              placeholder="app-db"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>
          <Field label="Database">
            <Input
              required
              value={form.database}
              onChange={(e) => update("database", e.target.value)}
            />
          </Field>
          <Field label="Owner">
            <Input
              required
              value={form.owner}
              onChange={(e) => update("owner", e.target.value)}
            />
          </Field>
          <Field label="Password">
            <Input
              required
              minLength={12}
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
          </Field>
          <Field label="PostgreSQL version">
            <Select
              value={form.version}
              onChange={(e) => update("version", e.target.value)}
            >
              <option>17</option>
              <option>16</option>
            </Select>
          </Field>
          <Field label="Instances">
            <Input
              min="1"
              max="5"
              required
              type="number"
              value={form.instances}
              onChange={(e) => update("instances", e.target.value)}
            />
          </Field>
          <Field label="Storage">
            <Input
              required
              value={form.storageSize}
              onChange={(e) => update("storageSize", e.target.value)}
            />
          </Field>
          <Field label="Pool mode">
            <Select
              disabled={!form.poolerEnabled}
              value={form.poolMode}
              onChange={(e) =>
                update("poolMode", e.target.value as DatabaseForm["poolMode"])
              }
            >
              <option value="session">session</option>
              <option value="transaction">transaction</option>
            </Select>
          </Field>

          <Checkbox
            label="Enable PgBouncer"
            checked={form.poolerEnabled}
            disabled={form.public}
            onChange={(e) => update("poolerEnabled", e.target.checked)}
          />
          <Field label="Pooler replicas">
            <Input
              min="1"
              max="5"
              required
              type="number"
              disabled={!form.poolerEnabled}
              value={form.poolerInstances}
              onChange={(e) => update("poolerInstances", e.target.value)}
            />
          </Field>
          <Checkbox
            label="Expose on local network"
            checked={form.public}
            onChange={(e) =>
              state.setDatabaseForm((current) => ({
                ...current,
                public: e.target.checked,
                poolerEnabled: e.target.checked || current.poolerEnabled,
              }))
            }
          />
          <Field label="Local hostname">
            <Input
              required={form.public}
              disabled={!form.public}
              placeholder="db.local.edinstance.uk"
              value={form.publicHostname}
              onChange={(e) => update("publicHostname", e.target.value)}
            />
          </Field>
          <Checkbox
            label="Advanced source restrictions"
            checked={form.restrictPublicSources}
            disabled={!form.public}
            onChange={(e) => update("restrictPublicSources", e.target.checked)}
          />
          <Field
            label="Allowed source CIDRs"
            className="col-span-3 max-[860px]:col-auto"
          >
            <Input
              required={form.public && form.restrictPublicSources}
              disabled={!form.public || !form.restrictPublicSources}
              placeholder="203.0.113.10/32, 198.51.100.0/24"
              value={form.publicSourceCidrs}
              onChange={(e) => update("publicSourceCidrs", e.target.value)}
            />
          </Field>

          <div className="col-span-4 mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#332e3e] pt-5 max-[860px]:col-auto">
            <p className="m-0 max-w-[560px] text-xs leading-5 text-[#91899f]">
              Local databases get a dedicated MetalLB address on port 5432.
              They are available only through local DNS and are not exposed by
              Cloudflare Tunnel.
            </p>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={state.saving} type="submit">
                {state.saving ? "Creating…" : "Create database"}
              </Button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
