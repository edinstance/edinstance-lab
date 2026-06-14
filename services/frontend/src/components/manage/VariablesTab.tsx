import { useState } from "react";

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
  const [envContent, setEnvContent] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    void controller.saveEnvVar(app, event);
  }

  async function submitEnvContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await controller.importEnvContent(app, envContent);
    setEnvContent("");
  }

  async function toggleValue(name: string) {
    if (visible[name]) {
      setVisible((current) => ({ ...current, [name]: false }));
      return;
    }
    if (!(name in values)) {
      setRevealing(name);
      const value = await controller.revealEnvVar(app, name);
      setRevealing(null);
      if (value === null) return;
      setValues((current) => ({ ...current, [name]: value }));
    }
    setVisible((current) => ({ ...current, [name]: true }));
  }

  function updateValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setChanges((current) => ({ ...current, [name]: value }));
  }

  async function saveChanges() {
    if (await controller.saveEnvChanges(app, changes)) {
      setChanges({});
      setVisible({});
      setValues({});
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-xl font-semibold">
            {variables.length} service variables
          </h3>
          <p className="mt-1 mb-0 text-sm text-[#91899f]">
            Values are encrypted at rest. Reveal only when needed.
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

      <form
        className="grid gap-3 rounded-xl border border-[#342e40] bg-[#1b1724] p-5"
        onSubmit={(event) => void submitEnvContent(event)}
      >
        <Field label="Paste .env content">
          <textarea
            className="min-h-36 w-full resize-y rounded-lg border border-[#42394f] bg-[#120f18] px-4 py-3 font-mono text-sm text-[#eee8f5] outline-none focus:border-[#a855f7]"
            onChange={(event) => setEnvContent(event.target.value)}
            placeholder={"VITE_PLATFORM_API_URL=https://api.edinstance.uk\nVITE_AUTH_BASE_URL=https://ui.edinstance.uk\nVITE_MOCK_PLATFORM=false"}
            value={envContent}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-xs text-[#91899f]">
            One KEY=value per line. On macOS, press Cmd+Shift+. in Finder to show hidden .env files.
          </p>
          <Button disabled={busy || !envContent.trim()} type="submit">
            Import variables
          </Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-[#342e40]">
        {variables.length ? (
          variables.map((variable) => (
            <div
              className="grid grid-cols-[minmax(150px,1fr)_minmax(220px,1.5fr)_auto] items-center gap-4 border-b border-[#302a3a] px-5 py-4 last:border-0 max-[700px]:grid-cols-1"
              key={variable.name}
            >
              <code className="text-sm text-[#e7e1ee]">
                {"{}"} &nbsp;{variable.name}
              </code>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`${variable.name} value`}
                  disabled={busy || revealing === variable.name}
                  onChange={(event) => updateValue(variable.name, event.target.value)}
                  placeholder={revealing === variable.name ? "Decrypting…" : "••••••••••••"}
                  type={visible[variable.name] ? "text" : "password"}
                  value={values[variable.name] ?? ""}
                />
                <button
                  aria-label={visible[variable.name] ? `Hide ${variable.name}` : `Reveal ${variable.name}`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#494153] text-[#aaa2b5] hover:bg-white/5 hover:text-white"
                  disabled={busy || revealing === variable.name}
                  onClick={() => void toggleValue(variable.name)}
                  title={visible[variable.name] ? "Hide value" : "Reveal value"}
                  type="button"
                >
                  <EyeIcon hidden={visible[variable.name]} />
                </button>
              </div>
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

      {Object.keys(changes).length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#5d4730] bg-[#251c12] p-4">
          <p className="m-0 text-sm text-[#dbc49e]">
            {Object.keys(changes).length} unsaved environment {Object.keys(changes).length === 1 ? "change" : "changes"}
          </p>
          <Button disabled={busy} onClick={() => void saveChanges()}>
            {busy ? "Saving…" : "Save changes and redeploy"}
          </Button>
        </div>
      ) : null}

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

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.5-6 9.75-6 9.75 6 9.75 6-3.5 6-9.75 6S2.25 12 2.25 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  ) : (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.25 0 9.75 6 9.75 6a16 16 0 0 1-2.1 2.75M6.2 6.2C3.65 8.05 2.25 12 2.25 12S5.75 18 12 18c1.45 0 2.75-.32 3.9-.82M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
