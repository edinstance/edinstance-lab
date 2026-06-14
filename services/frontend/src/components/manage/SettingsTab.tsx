import { useEffect, useState } from "react";

import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import type { PlatformApp } from "../../topology/topology";

export function SettingsTab({
  app,
  busy,
  onDelete,
  onSaveHealthPath,
}: {
  app: PlatformApp;
  busy: boolean;
  onDelete: () => void;
  onSaveHealthPath: (path: string) => Promise<boolean>;
}) {
  const [healthPath, setHealthPath] = useState(app.healthPath);
  useEffect(() => setHealthPath(app.healthPath), [app.healthPath]);

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-[#342e40] p-5">
        <p className="section-label">Runtime</p>
        <dl className="grid grid-cols-[150px_1fr] gap-x-5 gap-y-3 text-sm">
          <dt className="text-[#91899f]">Image</dt>
          <dd className="m-0 font-mono break-all">{app.image}</dd>
          <dt className="text-[#91899f]">Port</dt>
          <dd className="m-0">{app.port}</dd>
          <dt className="text-[#91899f]">Replicas</dt>
          <dd className="m-0">{app.replicas}</dd>
        </dl>
        <div className="mt-5 flex items-end gap-3">
          <Field className="flex-1" label="Health route">
            <Input
              value={healthPath}
              onChange={(event) => setHealthPath(event.target.value)}
            />
          </Field>
          <Button
            disabled={busy || healthPath === app.healthPath}
            onClick={() => void onSaveHealthPath(healthPath)}
          >
            Save
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-[#6b3038] bg-[#241116] p-5">
        <h3 className="m-0 text-lg font-semibold text-[#ffadb3]">
          Delete service
        </h3>
        <p className="mt-2 mb-5 text-sm text-[#b99095]">
          Removes the deployment, service, route, network policy, and stored
          configuration.
        </p>
        <Button disabled={busy} onClick={onDelete} variant="destructive">
          {busy ? "Deleting…" : `Delete ${app.name}`}
        </Button>
      </section>
    </div>
  );
}
