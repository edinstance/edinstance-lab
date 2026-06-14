import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  createApp,
  createDatabase,
  deleteApp,
  deleteEnvVar,
  getEnvVar,
  getSession,
  listApps,
  listDatabases,
  listEnvVars,
  redeployApp,
  setEnvVar,
  updateAppHealthPath,
  uploadEnvFile,
} from "../../platform/api";
import {
  appEnvVarsQueryKey,
  sessionQueryKey,
  topologyQueryKey,
} from "../../platform/queryKeys";
import type { ChangeEvent, FormEvent } from "react";

import type { EnvVariable, PostgresDatabase } from "../../platform/api";
import type { PlatformApp } from "../../topology/topology";
import type { AppForm, DatabaseForm, EnvDraft, ManageState } from "./types";

interface ManageTopology {
  apps: Array<PlatformApp>;
  databases: Array<PostgresDatabase>;
}

const initialAppForm: AppForm = {
  name: "",
  image: "",
  port: "3000",
  replicas: "3",
  healthPath: "/health",
  domains: "",
  envContent: "",
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
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialAppForm);
  const [databaseForm, setDatabaseForm] = useState(initialDatabaseForm);
  const [envDraft, setEnvDraft] = useState<EnvDraft>({ name: "", value: "" });
  const [envVars, setEnvVars] = useState<Record<string, Array<EnvVariable>>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const [envApp, setEnvApp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data: sessionData,
    error: sessionError,
    isLoading: sessionLoading,
  } = useQuery({
    queryKey: sessionQueryKey,
    queryFn: getSession,
    retry: false,
  });

  const {
    data: topologyData,
    error: topologyError,
    isLoading: topologyLoading,
  } = useQuery({
    enabled: sessionData?.authenticated === true,
    queryKey: topologyQueryKey,
    queryFn: async () => {
      const [apps, databases] = await Promise.all([
        listApps(),
        listDatabases(),
      ]);
      return { apps, databases };
    },
  });

  const apps = topologyData?.apps ?? [];
  const databases = topologyData?.databases ?? [];
  const loading =
    sessionLoading ||
    (sessionData?.authenticated === true && topologyLoading);
  const loadError = sessionError ?? topologyError;

  async function refreshTopology() {
    await queryClient.invalidateQueries({ queryKey: topologyQueryKey });
  }

  useEffect(() => {
    if (sessionData && !sessionData.authenticated)
      void navigate({ to: "/login" });
  }, [navigate, sessionData]);

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
      const healthPath = form.healthPath.trim();
      if (!name || !image) throw new Error("Name and image are required");
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("Port must be a whole number between 1 and 65535");
      if (!Number.isInteger(replicas) || replicas < 1 || replicas > 20)
        throw new Error("Replicas must be a whole number between 1 and 20");
      if (!healthPath.startsWith("/") || /\s/.test(healthPath))
        throw new Error("Health path must start with / and contain no whitespace");
      const app = await createApp({
        name,
        image,
        port,
        replicas,
        healthPath,
        domains: form.domains
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      if (form.envContent.trim()) {
        try {
          const result = await uploadEnvFile(app.name, form.envContent);
          setEnvVars((current) => ({ ...current, [app.name]: result.env }));
          queryClient.setQueryData(appEnvVarsQueryKey(app.name), result.env);
        } catch (err) {
          setForm(initialAppForm);
          setError(
            `${app.name} was created, but its environment variables were not saved: ${
              err instanceof Error ? err.message : "Unable to upload env vars"
            }`,
          );
          await refreshTopology();
          return true;
        }
      }
      setForm(initialAppForm);
      setNotice(
        form.envContent.trim()
          ? `${app.name} created with environment variables`
          : `${app.name} created`,
      );
      await refreshTopology();
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
      queryClient.setQueryData<ManageTopology>(topologyQueryKey, (current) =>
        current
          ? { ...current, databases: [...current.databases, database] }
          : { apps, databases: [database] },
      );
      setDatabaseForm((current) => ({ ...current, name: "", password: "" }));
      setNotice(`${database.name} PostgreSQL cluster requested`);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create database",
      );
      return false;
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
      await refreshTopology();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete app");
    } finally {
      setBusyApp(null);
    }
  }

  async function redeploy(app: PlatformApp) {
    setBusyApp(app.name);
    setError(null);
    setNotice(null);
    try {
      await redeployApp(app.name);
      setNotice(`${app.name} redeploy requested`);
      await refreshTopology();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to redeploy app");
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
    await importEnvContent(app, await file.text());
  }

  async function importEnvContent(app: PlatformApp, content: string) {
    if (!content.trim()) {
      setError("Paste at least one KEY=value line");
      return;
    }
    if (new Blob([content]).size > 1024 * 1024) {
      setError("Env content too large; must be <= 1 MiB");
      return;
    }
    setBusyApp(app.name);
    setError(null);
    setNotice(null);
    try {
      const result = await uploadEnvFile(app.name, content);
      setEnvVars((current) => ({ ...current, [app.name]: result.env }));
      queryClient.setQueryData(appEnvVarsQueryKey(app.name), result.env);
      setNotice(`${app.name} env updated: ${result.env.length} secrets stored`);
      await refreshTopology();
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
        const variables = await queryClient.fetchQuery({
          queryKey: appEnvVarsQueryKey(app.name),
          queryFn: () => listEnvVars(app.name),
          staleTime: 30_000,
        });
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
      const nextVariables = [
        ...(envVars[app.name] ?? []).filter((item) => item.name !== name),
        variable,
      ].sort((a, b) => a.name.localeCompare(b.name));
      setEnvVars((current) => ({ ...current, [app.name]: nextVariables }));
      queryClient.setQueryData(appEnvVarsQueryKey(app.name), nextVariables);
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
      const nextVariables = (envVars[app.name] ?? []).filter(
        (item) => item.name !== name,
      );
      setEnvVars((current) => ({ ...current, [app.name]: nextVariables }));
      queryClient.setQueryData(appEnvVarsQueryKey(app.name), nextVariables);
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

  async function revealEnvVar(app: PlatformApp, name: string) {
    setError(null);
    try {
      return await getEnvVar(app.name, name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to reveal environment variable",
      );
      return null;
    }
  }

  async function saveEnvChanges(app: PlatformApp, changes: Record<string, string>) {
    const entries = Object.entries(changes);
    if (!entries.length) return false;
    setBusyApp(app.name);
    setError(null);
    setNotice(null);
    try {
      await Promise.all(
        entries.map(([name, value]) => setEnvVar(app.name, name, value)),
      );
      await redeployApp(app.name);
      setNotice(
        `${entries.length} environment ${entries.length === 1 ? "variable" : "variables"} saved; ${app.name} redeploy requested`,
      );
      await refreshTopology();
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save environment changes",
      );
      return false;
    } finally {
      setBusyApp(null);
    }
  }

  async function saveHealthPath(app: PlatformApp, healthPath: string) {
    setBusyApp(app.name);
    setError(null);
    setNotice(null);
    try {
      await updateAppHealthPath(app.name, healthPath.trim());
      setNotice(`${app.name} health route updated`);
      await refreshTopology();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update health route");
      return false;
    } finally {
      setBusyApp(null);
    }
  }

  const state: ManageState = {
    apps,
    databases,
    loading,
    saving,
    error:
      error ??
      (loadError instanceof Error
        ? loadError.message
        : null),
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
    redeploy,
    importEnv,
    importEnvContent,
    toggleEnvironment,
    saveEnvVar,
    removeEnvVar,
    revealEnvVar,
    saveEnvChanges,
    saveHealthPath,
  };
}
