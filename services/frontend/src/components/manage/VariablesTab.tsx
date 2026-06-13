import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { EmptyState } from "./EmptyState";
import type { PlatformApp } from "../../topology/topology";
import type { ChangeEvent, FormEvent } from "react";
import type { ManageController } from "./types";

interface VariablesTabProps {
  app: PlatformApp;
  busy: boolean;
  controller: ManageController;
  importFile: (event: ChangeEvent<HTMLInputElement>) => void;
  variables: ManageController["state"]["envVars"][string];
}

export function VariablesTab({
  app,
  busy,
  controller,
  importFile,
  variables,
}: VariablesTabProps) {
  const { state } = controller;

  function submit(event: FormEvent<HTMLFormElement>) {
    void controller.saveEnvVar(app, event);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-xl font-semibold">
            {variables.length} service variables
          </h3>
          <p className="mt-1 mb-0 text-sm text-[#91899f]">
            Encrypted values are never returned by the API.
          </p>
        </div>

        <label className="secondary-action cursor-pointer">
          <input
            accept=".env,text/plain"
            className="sr-only"
            onChange={importFile}
            type="file"
          />
          Import .env
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#342e40]">
        {variables.length ? (
          variables.map((variable) => (
            <div
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-4 border-b border-[#302a3a] px-5 py-4 last:border-0 max-[600px]:grid-cols-[1fr_auto]"
              key={variable.name}
            >
              <code className="text-sm text-[#e7e1ee]">
                {"{}"} &nbsp;{variable.name}
              </code>
              <span className="font-mono tracking-widest text-[#777080] max-[600px]:hidden">
                ••••••••••••
              </span>
              <Button
                disabled={busy}
                onClick={() => void controller.removeEnvVar(app, variable.name)}
                size="sm"
                variant="ghost"
              >
                Delete
              </Button>
            </div>
          ))
        ) : (
          <EmptyState
            text={busy ? "Loading variables…" : "No variables configured"}
          />
        )}
      </div>

      <form
        className="grid grid-cols-[1fr_1.5fr_auto] items-end gap-3 rounded-xl border border-[#342e40] bg-[#1b1724] p-5 max-[700px]:grid-cols-1"
        onSubmit={submit}
      >
        <Field label="Variable">
          <Input
            onChange={(event) =>
              state.setEnvDraft((current) => ({
                ...current,
                name: event.target.value.toUpperCase(),
              }))
            }
            placeholder="DATABASE_URL"
            required
            value={state.envDraft.name}
          />
        </Field>

        <Field label="Value">
          <Input
            onChange={(event) =>
              state.setEnvDraft((current) => ({
                ...current,
                value: event.target.value,
              }))
            }
            required
            type="password"
            value={state.envDraft.value}
          />
        </Field>

        <Button disabled={busy} type="submit">
          Add variable
        </Button>
      </form>
    </div>
  );
}
