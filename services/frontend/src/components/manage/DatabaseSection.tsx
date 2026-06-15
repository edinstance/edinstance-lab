import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import type { FormEventHandler } from "react";
import type { DatabaseForm, ManageState } from "./types";

export function DatabaseSection({
  state,
  onSubmit,
}: {
  state: ManageState;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  const form = state.databaseForm;
  const update = <TKey extends keyof DatabaseForm>(
    name: TKey,
    value: DatabaseForm[TKey],
  ) => state.setDatabaseForm((current) => ({ ...current, [name]: value }));
  return (
    <section
      className="mx-auto mb-[18px] max-w-[1180px] border border-[#c9c1af] bg-[#fffdf7e6]"
      aria-label="Create PostgreSQL database"
    >
      <div className="border-b border-[#c9c1af] px-4 py-3">
        <h2 className="m-0 text-2xl">PostgreSQL cluster</h2>
      </div>
      <form
        className="grid grid-cols-4 gap-3.5 p-4 max-[860px]:grid-cols-1"
        onSubmit={onSubmit}
      >
        <Field label="Name / DNS prefix">
          <Input
            required
            pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?"
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
            type="number"
            value={form.instances}
            onChange={(e) => update("instances", e.target.value)}
          />
        </Field>
        <Field label="Storage">
          <Input
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
          label="Allowed source CIDRs (optional)"
          className="col-span-2 max-[860px]:col-auto"
        >
          <Input
            required={form.public && form.restrictPublicSources}
            disabled={!form.public || !form.restrictPublicSources}
            placeholder="203.0.113.10/32, 198.51.100.0/24"
            value={form.publicSourceCidrs}
            onChange={(e) => update("publicSourceCidrs", e.target.value)}
          />
        </Field>
        <Button className="self-end" disabled={state.saving} type="submit">
          Create database
        </Button>
      </form>
      {form.public ? (
        <p className="m-0 border-t border-[#c9c1af] px-4 py-3 font-mono text-xs font-bold text-[#b0822e]">
          Creates a dedicated local MetalLB address on port 5432. This is only
          reachable through local DNS and is not exposed through Cloudflare
          Tunnel.
        </p>
      ) : null}
      {state.databases.length ? (
        <div className="border-t border-[#c9c1af] p-4">
          {state.databases.map((database) => (
            <article
              className="mb-3 grid gap-1 font-mono text-sm last:mb-0"
              key={database.name}
            >
              <strong>
                {database.name} · PostgreSQL {database.version} ·{" "}
                {database.status}
              </strong>
              <code className="text-[#2d6f8f]">
                {database.host}:5432/{database.database}
              </code>
              {database.public ? (
                <code className="text-[#d65236]">
                  Local: {database.publicHostname}:5432 · allow{" "}
                  {database.publicSourceCidrs?.length
                    ? database.publicSourceCidrs.join(", ")
                    : "all sources"}
                </code>
              ) : null}
              <span>
                Credentials Secret: {database.credentialsSecret} ·{" "}
                {database.instances} DB replicas
                {database.poolerEnabled
                  ? ` · ${database.poolerInstances} PgBouncer (${database.poolMode})`
                  : ""}
              </span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
