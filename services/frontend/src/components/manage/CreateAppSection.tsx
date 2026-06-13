import type { FormEventHandler } from "react";

import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import type { ManageState } from "./types";

export function CreateAppSection({ state, onSubmit }: { state: ManageState; onSubmit: FormEventHandler<HTMLFormElement> }) {
  const update = (name: keyof typeof state.form, value: string) => state.setForm((current) => ({ ...current, [name]: value }));
  return (
    <section className="mx-auto mb-[18px] max-w-[1180px] border border-[#c9c1af] bg-[#fffdf7e6]" aria-label="Create platform app">
      <form className="grid grid-cols-[1fr_minmax(260px,2fr)_120px_120px] gap-3.5 p-4 max-[860px]:grid-cols-1" onSubmit={onSubmit}>
        <Field label="Name"><Input pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?" required value={state.form.name} onChange={(e) => update("name", e.target.value)} /></Field>
        <Field label="Image"><Input required value={state.form.image} placeholder="ghcr.io/org/app:tag" onChange={(e) => update("image", e.target.value)} /></Field>
        <Field label="Port"><Input min="1" max="65535" required type="number" value={state.form.port} onChange={(e) => update("port", e.target.value)} /></Field>
        <Field label="Replicas"><Input min="1" max="20" required type="number" value={state.form.replicas} onChange={(e) => update("replicas", e.target.value)} /></Field>
        <Field label="Domains" className="col-[1/-2] max-[860px]:col-auto"><Input value={state.form.domains} placeholder="app.local.edinstance.uk, app.edinstance.uk" onChange={(e) => update("domains", e.target.value)} /></Field>
        <Button className="self-end" disabled={state.saving} type="submit">{state.saving ? "Creating..." : "Create app"}</Button>
      </form>
      {state.notice ? <p className="m-0 border-t border-[#c9c1afbf] px-4 py-[18px] font-mono text-[.82rem] font-extrabold leading-[1.4] text-[#517a38]">{state.notice}</p> : null}
    </section>
  );
}
