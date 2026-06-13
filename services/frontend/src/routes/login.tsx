import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { login, signup } from "../platform/api";
import type { SubmitEvent } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type Mode = "login" | "signup";

const tabClass =
  "min-h-11 border border-[#3d3648] bg-[#100e17] font-mono text-[.72rem] font-black uppercase leading-none text-[#91899f] transition disabled:cursor-not-allowed disabled:opacity-55 hover:text-white";

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [platformPassword, setPlatformPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup({ name, email, password, platformPassword });
      }
      await navigate({ to: "/manage" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#0d0b14] p-7 text-[#f4f1fa]">
      <form
        className="grid w-[min(460px,calc(100vw-48px))] gap-5 rounded-2xl border border-[#3a3445] bg-[#17141f] p-7 shadow-[0_28px_90px_rgba(0,0,0,.5)]"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div>
          <p className="mt-0 mb-2 font-mono text-[.68rem] leading-none font-black tracking-[.16em] text-[#8f879e] uppercase">
            edinstance
          </p>
          <h1 className="m-0 text-[2rem] leading-none font-semibold tracking-[-.025em] text-[#f4f1fa]">
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>
        </div>
        <div
          className="grid grid-cols-2"
          role="tablist"
          aria-label="Authentication mode"
        >
          <button
            aria-selected={mode === "login"}
            className={`${tabClass} rounded-l-lg ${mode === "login" ? "!border-[#8b5cf6] !bg-[#2b2140] !text-white" : ""}`}
            role="tab"
            type="button"
            onClick={() => selectMode("login")}
          >
            Sign in
          </button>
          <button
            aria-selected={mode === "signup"}
            className={`${tabClass} -ml-px rounded-r-lg ${mode === "signup" ? "!border-[#8b5cf6] !bg-[#2b2140] !text-white" : ""}`}
            role="tab"
            type="button"
            onClick={() => selectMode("signup")}
          >
            Sign up
          </button>
        </div>
        {mode === "signup" ? (
          <Field label="Name">
            <Input
              autoComplete="name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        ) : null}
        <Field label="Email">
          <Input
            autoComplete="email"
            autoFocus={mode === "login"}
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Account password">
          <Input
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={12}
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {mode === "signup" ? (
          <Field label="Platform password">
            <Input
              autoComplete="off"
              required
              type="password"
              value={platformPassword}
              onChange={(event) => setPlatformPassword(event.target.value)}
            />
          </Field>
        ) : null}
        {error ? (
          <p className="m-0 rounded-lg border border-[#6b2c38] bg-[#2a1118] px-3 py-2 text-sm text-[#ff9ba7]">
            {error}
          </p>
        ) : null}
        <Button disabled={submitting} type="submit">
          {submitting
            ? "Checking..."
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>
    </main>
  );
}
