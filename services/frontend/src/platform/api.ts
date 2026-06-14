import { env } from "../env";
import { authClient } from "../lib/auth-client";
import {
  mockCreateApp,
  mockCreateDatabase,
  mockDeleteApp,
  mockDeleteEnvVar,
  mockGetAppLogs,
  mockGetAppMetrics,
  mockGetEnvVar,
  mockGetSession,
  mockListApps,
  mockListDatabases,
  mockListEnvVars,
  mockLogin,
  mockLogout,
  mockRedeployApp,
  mockSetEnvVar,
  mockUpdateAppHealthPath,
  mockUploadEnvFile,
} from "./mock-data";
import type { PlatformApp } from "../topology/topology";

export interface Session {
  authenticated: boolean;
  user?: string;
}

export interface CreateAppInput {
  name: string;
  image: string;
  port: number;
  replicas?: number;
  healthPath?: string;
  domains?: Array<string>;
}

export async function updateAppHealthPath(
  name: string,
  healthPath: string,
): Promise<PlatformApp> {
  if (env.mockPlatform) return mockUpdateAppHealthPath(name, healthPath);
  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(name)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ healthPath }),
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Unable to update health path"));
  }
  return response.json() as Promise<PlatformApp>;
}

export interface EnvUploadResult {
  env: Array<{
    name: string;
    secret: boolean;
  }>;
}

export interface EnvVariable {
  name: string;
  secret: boolean;
}
export interface MetricSeries {
  pod: string;
  values: Array<[number, number]>;
}
export interface AppMetrics {
  rangeHours: number;
  series: { cpu: Array<MetricSeries>; memory: Array<MetricSeries> };
}
export interface LogEntry {
  timestamp: string;
  namespace: string;
  pod: string;
  container: string;
  level?: string;
  message: string;
}

export interface PostgresDatabase {
  name: string;
  namespace: string;
  database: string;
  owner: string;
  version: string;
  instances: number;
  storageSize: string;
  poolerEnabled: boolean;
  poolerInstances: number;
  poolMode: "session" | "transaction";
  public: boolean;
  publicHostname?: string;
  publicSourceCidrs?: Array<string>;
  host: string;
  credentialsSecret: string;
  status: string;
}

export type CreatePostgresInput = Omit<
  PostgresDatabase,
  "namespace" | "host" | "credentialsSecret" | "status"
> & { password: string };

const apiBase = env.platformApiUrl;
const requestTimeoutMs = 10_000;

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getSession(): Promise<Session> {
  if (env.mockPlatform) return mockGetSession();

  const session = await authClient.getSession();
  if (!session.data?.user.email) {
    return { authenticated: false };
  }
  return { authenticated: true, user: session.data.user.email };
}

export async function login(email: string, password: string): Promise<Session> {
  if (env.mockPlatform) return mockLogin();

  requireSecureConnection();
  const result = await authClient.signIn.email({
    email,
    password,
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Invalid credentials");
  }
  return { authenticated: true, user: result.data.user.email };
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
  platformPassword: string;
}): Promise<Session> {
  if (env.mockPlatform) return mockLogin();

  requireSecureConnection();
  const result = await authClient.signUp.email({
    name: input.name,
    email: input.email,
    password: input.password,
    fetchOptions: {
      headers: {
        "x-platform-signup-password": input.platformPassword,
      },
    },
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Unable to create account");
  }
  return { authenticated: true, user: result.data.user.email };
}

export async function logout(): Promise<void> {
  if (env.mockPlatform) return mockLogout();

  await authClient.signOut();
}

export async function listApps(): Promise<Array<PlatformApp>> {
  if (env.mockPlatform) return mockListApps();

  const response = await apiFetch(`${apiBase}/api/apps`, {
    headers: await authHeaders(),
  });
  if (response.status === 401)
    throw new Error("Your session has expired; sign in again");
  if (!response.ok) {
    throw new Error("Unable to load platform apps");
  }
  const body = (await response.json()) as { apps: Array<PlatformApp> };
  return body.apps;
}

export async function createApp(input: CreateAppInput): Promise<PlatformApp> {
  if (env.mockPlatform) return mockCreateApp(input);

  const response = await apiFetch(`${apiBase}/api/apps`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Unable to create app"));
  }
  return response.json() as Promise<PlatformApp>;
}

export async function deleteApp(name: string): Promise<void> {
  if (env.mockPlatform) return mockDeleteApp(name);

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(name)}`,
    {
      method: "DELETE",
      headers: await authHeaders(),
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Unable to delete app"));
  }
}

export async function redeployApp(name: string): Promise<void> {
  if (env.mockPlatform) return mockRedeployApp(name);

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(name)}/redeploy`,
    {
      method: "POST",
      headers: await authHeaders(),
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Unable to redeploy app"));
  }
}

export async function getAppMetrics(
  name: string,
  hours: number,
  options: { namespace?: string; app?: string } = {},
): Promise<AppMetrics> {
  if (env.mockPlatform) return mockGetAppMetrics(name, hours);

  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Hours must be a positive number");
  }

  const params = new URLSearchParams({ hours: String(hours) });
  if (options.namespace) params.set("namespace", options.namespace);
  if (options.app) params.set("app", options.app);

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(name)}/metrics?${params}`,
    { headers: await authHeaders() },
  );

  if (!response.ok) {
    throw new Error(
      await readError(response, "Unable to load service metrics"),
    );
  }

  return response.json() as Promise<AppMetrics>;
}

export async function getAppLogs(
  name: string,
  options: { namespace?: string; app?: string; limit?: number } = {},
): Promise<Array<LogEntry>> {
  if (env.mockPlatform) return mockGetAppLogs(name, options.limit);

  const params = new URLSearchParams();
  if (options.namespace) params.set("namespace", options.namespace);
  if (options.app) params.set("app", options.app);
  if (options.limit) params.set("limit", String(options.limit));

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(name)}/logs?${params}`,
    { headers: await authHeaders() },
  );

  if (!response.ok) {
    throw new Error(await readError(response, "Unable to load service logs"));
  }

  const body = (await response.json()) as { entries: Array<LogEntry> };
  return body.entries;
}

export async function uploadEnvFile(
  name: string,
  content: string,
): Promise<EnvUploadResult> {
  if (env.mockPlatform) return mockUploadEnvFile(name, content);

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(name)}/env-file`,
    {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Unable to upload env file"));
  }
  return response.json() as Promise<EnvUploadResult>;
}

export async function listEnvVars(name: string): Promise<Array<EnvVariable>> {
  if (env.mockPlatform) return mockListEnvVars(name);

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(name)}/env`,
    { headers: await authHeaders() },
  );
  if (!response.ok)
    throw new Error(
      await readError(response, "Unable to load environment variables"),
    );
  return ((await response.json()) as { env: Array<EnvVariable> }).env;
}

export async function setEnvVar(
  app: string,
  name: string,
  value: string,
): Promise<EnvVariable> {
  if (env.mockPlatform) return mockSetEnvVar(app, name, value);

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(app)}/env/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
  if (!response.ok)
    throw new Error(
      await readError(response, "Unable to save environment variable"),
    );
  return response.json() as Promise<EnvVariable>;
}

export async function getEnvVar(app: string, name: string): Promise<string> {
  if (env.mockPlatform) return mockGetEnvVar(app, name);

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(app)}/env/${encodeURIComponent(name)}`,
    { headers: await authHeaders() },
  );
  if (!response.ok) {
    throw new Error(
      await readError(response, "Unable to reveal environment variable"),
    );
  }
  return ((await response.json()) as { value: string }).value;
}

export async function deleteEnvVar(app: string, name: string): Promise<void> {
  if (env.mockPlatform) return mockDeleteEnvVar(app, name);

  const response = await apiFetch(
    `${apiBase}/api/apps/${encodeURIComponent(app)}/env/${encodeURIComponent(name)}`,
    {
      method: "DELETE",
      headers: await authHeaders(),
    },
  );
  if (!response.ok)
    throw new Error(
      await readError(response, "Unable to delete environment variable"),
    );
}

export async function listDatabases(): Promise<Array<PostgresDatabase>> {
  if (env.mockPlatform) return mockListDatabases();

  const response = await apiFetch(`${apiBase}/api/databases`, {
    headers: await authHeaders(),
  });
  if (!response.ok)
    throw new Error(await readError(response, "Unable to load databases"));
  return ((await response.json()) as { databases: Array<PostgresDatabase> })
    .databases;
}

export async function createDatabase(
  input: CreatePostgresInput,
): Promise<PostgresDatabase> {
  if (env.mockPlatform) return mockCreateDatabase(input);

  const response = await apiFetch(`${apiBase}/api/databases`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(await readError(response, "Unable to create database"));
  return response.json() as Promise<PostgresDatabase>;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (env.mockPlatform) return {};

  const result = await authClient.token();
  const token = result.data?.token;
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

function requireSecureConnection(): void {
  const { protocol, hostname } = window.location;
  const isLocalhost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (protocol !== "https:" && !isLocalhost) {
    throw new Error(
      "Refusing to send credentials over an insecure connection; use HTTPS",
    );
  }
}

async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Platform API request timed out");
    }
    throw new Error("Unable to reach the platform API");
  } finally {
    window.clearTimeout(timeout);
  }
}
