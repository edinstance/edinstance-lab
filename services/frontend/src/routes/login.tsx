import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type SubmitEvent } from "react";

import { login } from "../platform/api";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(password);
      await navigate({ to: "/manage" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div>
          <p>edinstance</p>
          <h1>Login</h1>
        </div>
        <label>
          <span>Password</span>
          <input
            autoComplete="current-password"
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button disabled={submitting} type="submit">
          {submitting ? "Checking..." : "Enter"}
        </button>
      </form>
    </main>
  );
}
