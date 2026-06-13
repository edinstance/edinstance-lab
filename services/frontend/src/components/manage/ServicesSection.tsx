import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import type { PlatformApp } from "../../topology/topology";
import type { ChangeEvent, FormEvent } from "react";
import type { ManageState } from "./types";

interface Props {
  state: ManageState;
  onDeleteApp: (app: PlatformApp) => void;
  onImportEnv: (app: PlatformApp, event: ChangeEvent<HTMLInputElement>) => void;
  onToggleEnvironment: (app: PlatformApp) => void;
  onSaveEnvVar: (app: PlatformApp, event: FormEvent<HTMLFormElement>) => void;
  onDeleteEnvVar: (app: PlatformApp, name: string) => void;
}

const rowClass =
  "grid min-h-14 grid-cols-[150px_150px_minmax(220px,1fr)_minmax(190px,1fr)_190px] gap-3.5 px-4 py-3.5 max-[860px]:grid-cols-1";

function EnvUpload({
  app,
  label,
  onChange,
}: {
  app: PlatformApp;
  label: string;
  onChange: Props["onImportEnv"];
}) {
  return (
    <label className="inline-flex min-w-0 cursor-pointer">
      <input
        className="absolute h-px w-px opacity-0"
        accept=".env,text/plain"
        type="file"
        onChange={(event) => onChange(app, event)}
      />
      <span className="inline-flex min-h-[30px] items-center justify-center border border-[#9c927f] bg-[#fffdf7e0] px-2.5 font-mono text-[.72rem] leading-none font-extrabold">
        {label}
      </span>
    </label>
  );
}

export function ServicesSection(props: Props) {
  const { state } = props;
  return (
    <section
      className="mx-auto max-w-[1180px] overflow-hidden border border-[#c9c1af] bg-[#fffdf7e6]"
      aria-label="Managed platform services"
    >
      <div
        className={`${rowClass} min-h-0 bg-[#17211b0f] font-mono text-[.68rem] leading-none font-black text-[#66736b] uppercase max-[860px]:hidden`}
      >
        <span>Name</span>
        <span>Status</span>
        <span>Image</span>
        <span>Domains</span>
        <span>Actions</span>
      </div>
      {state.loading ? <Message>Loading services...</Message> : null}
      {state.error ? <Message error>{state.error}</Message> : null}
      {!state.loading && !state.error && !state.apps.length ? (
        <Message>No platform services yet.</Message>
      ) : null}
      {state.apps.map((app) => (
        <ServiceRow key={app.name} app={app} {...props} />
      ))}
    </section>
  );
}

function Message({
  children,
  error = false,
}: {
  children: string;
  error?: boolean;
}) {
  return (
    <p
      className={`m-0 px-4 py-[18px] font-mono text-[.82rem] leading-[1.4] font-extrabold ${error ? "text-[#d65236]" : ""}`}
    >
      {children}
    </p>
  );
}

function ServiceRow({
  app,
  state,
  onDeleteApp,
  onImportEnv,
  onToggleEnvironment,
  onSaveEnvVar,
  onDeleteEnvVar,
}: Props & { app: PlatformApp }) {
  const busy = state.busyApp === app.name;
  const variables = state.envVars[app.name] ?? [];
  return (
    <article className="border-t border-[#c9c1afbf]">
      <div
        className={`${rowClass} [&>*]:min-w-0 [&>*]:[overflow-wrap:anywhere]`}
      >
        <strong className="font-mono text-[.9rem] leading-[1.3] font-black">
          {app.name}
        </strong>
        <span className="flex flex-wrap content-start gap-2">
          <span
            className={`border px-[7px] py-[5px] font-mono text-[.62rem] leading-none font-black uppercase ${app.ready ? "border-[#517a3861] text-[#517a38]" : "border-[#b0822e75] text-[#b0822e]"}`}
          >
            {app.status}
          </span>
          <small className="basis-full font-mono text-[.65rem] font-extrabold text-[#66736b]">
            {app.ready ? "ready" : "not ready"} / {app.replicas} replicas
          </small>
          {app.updatedAt ? (
            <small className="basis-full font-mono text-[.65rem] font-extrabold text-[#66736b]">
              {app.updatedAt}
            </small>
          ) : null}
        </span>
        <code className="font-mono text-[.76rem] leading-[1.45] font-extrabold text-[#2d6f8f]">
          {app.image}
        </code>
        <span>
          {app.domains.map((domain) => domain.host).join(", ") || "none"}
        </span>
        <span className="flex flex-wrap items-start gap-2">
          <EnvUpload
            app={app}
            label={busy ? "Working..." : "Upload env"}
            onChange={onImportEnv}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onToggleEnvironment(app)}
          >
            {state.envApp === app.name ? "Close env" : "Environment"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => onDeleteApp(app)}
          >
            Delete
          </Button>
        </span>
      </div>
      {state.envApp === app.name ? (
        <section
          className="grid gap-4 border-t border-[#c9c1afbf] bg-[#17211b08] p-4"
          aria-label={`${app.name} environment variables`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="m-0 font-mono text-[.68rem] font-black text-[#66736b] uppercase">
                Runtime configuration
              </p>
              <h3 className="m-0 text-xl">Environment variables</h3>
            </div>
            <EnvUpload app={app} label="Import .env" onChange={onImportEnv} />
          </div>
          <div className="grid gap-2">
            {variables.map((variable) => (
              <div
                className="grid grid-cols-[minmax(180px,1fr)_2fr_auto] items-center gap-3 border border-[#c9c1af] bg-[#fffdf7] px-3 py-2 max-[700px]:grid-cols-1"
                key={variable.name}
              >
                <code className="font-black">{variable.name}</code>
                <span className="font-mono text-sm text-[#66736b]">
                  ••••••••••••
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      state.setEnvDraft({ name: variable.name, value: "" })
                    }
                  >
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onDeleteEnvVar(app, variable.name)}
                  >
                    Delete
                  </Button>
                </span>
              </div>
            ))}
            {!variables.length && !busy ? (
              <p className="m-0 font-mono text-sm text-[#66736b]">
                No environment variables configured.
              </p>
            ) : null}
          </div>
          <form
            className="grid grid-cols-[1fr_2fr_auto] gap-3 max-[700px]:grid-cols-1"
            onSubmit={(event) => onSaveEnvVar(app, event)}
          >
            <Field label="Variable">
              <Input
                required
                placeholder="DATABASE_URL"
                value={state.envDraft.name}
                onChange={(event) =>
                  state.setEnvDraft((current) => ({
                    ...current,
                    name: event.target.value.toUpperCase(),
                  }))
                }
              />
            </Field>
            <Field
              label={`Value ${state.envDraft.name && variables.some((item) => item.name === state.envDraft.name) ? "(replaces existing)" : ""}`}
            >
              <Input
                required
                type="password"
                value={state.envDraft.value}
                onChange={(event) =>
                  state.setEnvDraft((current) => ({
                    ...current,
                    value: event.target.value,
                  }))
                }
              />
            </Field>
            <Button className="self-end" disabled={busy} type="submit">
              Save variable
            </Button>
          </form>
          <p className="m-0 font-mono text-xs text-[#66736b]">
            Values are encrypted at rest and are never returned by the API.
            Saving or deleting requests a workload rollout.
          </p>
        </section>
      ) : null}
    </article>
  );
}
