import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  createApp,
  createDatabase,
  deleteApp,
  deleteEnvVar,
  getSession,
  listApps,
  listDatabases,
  listEnvVars,
  setEnvVar,
  uploadEnvFile,
} from "../../platform/api";
import type { ChangeEvent, FormEvent } from "react";

import type { EnvVariable, PostgresDatabase } from "../../platform/api";
import type { PlatformApp } from "../../topology/topology";
import type { AppForm, DatabaseForm, EnvDraft, ManageState } from "./types";

const initialAppForm: AppForm = {
  name: "",
  image: "",
  port: "3000",
  replicas: "3",
  domains: "",
};
const initialDatabaseForm: DatabaseForm = {
  name: "",
  database: "app",
  owner: "app",
  password: "",
  version: "17",
  instances: "3",
  storageSize: "20Gi",
  poolerEnabled: true,
  poolerInstances: "2",
  poolMode: "session",
  public: false,
  publicHostname: "",
  restrictPublicSources: false,
  publicSourceCidrs: "",
};

export function useManageController() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<Array<PlatformApp>>([]);
  const [databases, setDatabases] = useState<Array<PostgresDatabase>>([]);
  const [form, setForm] = useState(initialAppForm);
  const [databaseForm, setDatabaseForm] = useState(initialDatabaseForm);
  const [envDraft, setEnvDraft] = useState<EnvDraft>({ name: "", value: "" });
  const [envVars, setEnvVars] = useState<Record<string, Array<EnvVariable>>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const [envApp, setEnvApp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refreshApps() {
    setApps(await listApps());
  }

  useEffect(() => {
    const request = { cancelled: false };
    void (async () => {
      try {
        if (!(await getSession()).authenticated) {
          await navigate({ to: "/login" });
          return;
        }
        const [nextApps, nextDatabases] = await Promise.all([
          listApps(),
          listDatabases(),
        ]);
        if (!request.cancelled) {
          setApps(nextApps);
          setDatabases(nextDatabases);
        }
      } catch (err) {
        if (!request.cancelled)
          setError(
            err instanceof Error ? err.message : "Unable to load services",
          );
      } finally {
        if (!request.cancelled) setLoading(false);
      }
    })();
    return () => {
      request.cancelled = true;
    };
  }, [navigate]);

  async function createAppFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const name = form.name.trim();
      const image = form.image.trim();
      const port = Number(form.port);
      const replicas = Number(form.replicas);
      if (!name || !image) throw new Error("Name and image are required");
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("Port must be a whole number between 1 and 65535");
      if (!Number.isInteger(replicas) || replicas < 1 || replicas > 20)
        throw new Error("Replicas must be a whole number between 1 and 20");
      const app = await createApp({
        name,
        image,
        port,
        replicas,
        domains: form.domains
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setForm(initialAppForm);
      setNotice(`${app.name} created`);
      await refreshApps();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create app");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createDatabaseFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const database = await createDatabase({
        name: databaseForm.name.trim(),
        database: databaseForm.database.trim(),
        owner: databaseForm.owner.trim(),
        password: databaseForm.password,
        version: databaseForm.version,
        instances: Number(databaseForm.instances),
        storageSize: databaseForm.storageSize.trim(),
        poolerEnabled: databaseForm.poolerEnabled,
        poolerInstances: Number(databaseForm.poolerInstances),
        poolMode: databaseForm.poolMode,
        public: databaseForm.public,
        publicHostname: databaseForm.publicHostname.trim(),
        publicSourceCidrs: databaseForm.restrictPublicSources
          ? databaseForm.publicSourceCidrs
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
      });
      setDatabases((current) => [...current, database]);
      setDatabaseForm((current) => ({ ...current, name: "", password: "" }));
      setNotice(`${database.name} PostgreSQL cluster requested`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create database",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeApp(app: PlatformApp) {
    if (!window.confirm(`Delete ${app.name}?`)) return;
    setBusyApp(app.name);
    setError(null);
    setNotice(null);
    try {
      await deleteApp(app.name);
      setNotice(`${app.name} deleted`);
      await refreshApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete app");
    } finally {
      setBusyApp(null);
    }
  }

  async function importEnv(
    app: PlatformApp,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError("Env file too large; must be <= 1 MiB");
      return;
    }
    setBusyApp(app.name);
    setError(null);
    setNotice(null);
    try {
      const result = await uploadEnvFile(app.name, await file.text());
      setEnvVars((current) => ({ ...current, [app.name]: result.env }));
      setNotice(`${app.name} env updated: ${result.env.length} secrets stored`);
      await refreshApps();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to upload env file",
      );
    } finally {
      setBusyApp(null);
    }
  }

  async function toggleEnvironment(app: PlatformApp) {
    if (envApp === app.name) {
      setEnvApp(null);
      return;
    }
    setEnvApp(app.name);
    setEnvDraft({ name: "", value: "" });
    if (!(app.name in envVars)) {
      setBusyApp(app.name);
      try {
        const variables = await listEnvVars(app.name);
        setEnvVars((current) => ({ ...current, [app.name]: variables }));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load environment variables",
        );
      } finally {
        setBusyApp(null);
      }
    }
  }

  async function saveEnvVar(
    app: PlatformApp,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const name = envDraft.name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setError(
        "Environment variable names must use letters, numbers, and underscores",
      );
      return;
    }
    setBusyApp(app.name);
    setError(null);
    try {
      const variable = await setEnvVar(app.name, name, envDraft.value);
      setEnvVars((current) => ({
        ...current,
        [app.name]: [
          ...(current[app.name] ?? []).filter((item) => item.name !== name),
          variable,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      setEnvDraft({ name: "", value: "" });
      setNotice(`${name} saved; ${app.name} reconciliation requested`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save environment variable",
      );
    } finally {
      setBusyApp(null);
    }
  }

  async function removeEnvVar(app: PlatformApp, name: string) {
    setBusyApp(app.name);
    setError(null);
    try {
      await deleteEnvVar(app.name, name);
      setEnvVars((current) => ({
        ...current,
        [app.name]: (current[app.name] ?? []).filter(
          (item) => item.name !== name,
        ),
      }));
      setNotice(`${name} deleted; ${app.name} reconciliation requested`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete environment variable",
      );
    } finally {
      setBusyApp(null);
    }
  }

  const state: ManageState = {
    apps,
    databases,
    loading,
    saving,
    error,
    notice,
    busyApp,
    envApp,
    envVars,
    form,
    databaseForm,
    envDraft,
    setForm,
    setDatabaseForm,
    setEnvDraft,
  };
  return {
    state,
    createAppFromForm,
    createDatabaseFromForm,
    removeApp,
    importEnv,
    toggleEnvironment,
    saveEnvVar,
    removeEnvVar,
  };
}
