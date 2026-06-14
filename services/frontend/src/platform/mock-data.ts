import type {
  AppMetrics,
  CreateAppInput,
  CreatePostgresInput,
  EnvUploadResult,
  EnvVariable,
  LogEntry,
  PostgresCredentials,
  PostgresDatabase,
  Session,
} from "./api";
import type { PlatformApp } from "../topology/topology";

const now = Date.now();

let apps: Array<PlatformApp> = [
  {
    name: "storefront",
    image: "ghcr.io/edinstance/storefront:2026.06.14",
    status: "active",
    ready: true,
    replicas: 3,
    port: 3000,
    healthPath: "/health",
    domains: [
      {
        host: "storefront.local.edinstance.uk",
        scope: "local",
        status: "ready",
      },
      { host: "shop.edinstance.uk", scope: "public", status: "ready" },
    ],
    lastBuild: "7 minutes ago",
    source: "github.com/edinstance/storefront",
    updatedAt: new Date(now - 7 * 60_000).toISOString(),
  },
  {
    name: "orders-api",
    image: "ghcr.io/edinstance/orders-api:dev",
    status: "active",
    ready: true,
    replicas: 2,
    port: 8080,
    healthPath: "/healthz",
    domains: [
      { host: "orders.local.edinstance.uk", scope: "local", status: "ready" },
    ],
    lastBuild: "18 minutes ago",
    source: "services/orders-api",
    updatedAt: new Date(now - 18 * 60_000).toISOString(),
  },
  {
    name: "worker",
    image: "ghcr.io/edinstance/worker:canary",
    status: "degraded",
    ready: false,
    replicas: 2,
    port: 9090,
    healthPath: "/health",
    domains: [],
    lastBuild: "42 minutes ago",
    source: "services/worker",
    updatedAt: new Date(now - 42 * 60_000).toISOString(),
  },
];

let databases: Array<PostgresDatabase> = [
  {
    name: "app-primary",
    namespace: "database-app-primary",
    database: "app",
    owner: "app",
    version: "17",
    instances: 3,
    storageSize: "20Gi",
    poolerEnabled: true,
    poolerInstances: 2,
    poolMode: "session",
    public: false,
    host: "app-primary-rw.database-app-primary.svc.cluster.local",
    credentialsSecret: "app-primary-credentials",
    status: "ready",
  },
  {
    name: "analytics",
    namespace: "database-analytics",
    database: "warehouse",
    owner: "warehouse",
    version: "17",
    instances: 1,
    storageSize: "50Gi",
    poolerEnabled: false,
    poolerInstances: 0,
    poolMode: "session",
    public: true,
    publicHostname: "analytics-db.edinstance.uk",
    publicSourceCidrs: ["203.0.113.10/32"],
    host: "analytics-rw.database-analytics.svc.cluster.local",
    credentialsSecret: "analytics-credentials",
    status: "ready",
  },
];
const databasePasswords: Record<string, string> = {
  "app-primary": "mock-app-primary-password",
  analytics: "mock-analytics-password",
};

const envVars: Record<string, Array<EnvVariable>> = {
  storefront: [
    { name: "DATABASE_URL", secret: true },
    { name: "NEXT_PUBLIC_API_URL", secret: false },
  ],
  "orders-api": [
    { name: "DATABASE_URL", secret: true },
    { name: "STRIPE_WEBHOOK_SECRET", secret: true },
  ],
};
const envValues: Partial<Record<string, Record<string, string>>> = {};

export function mockGetSession(): Session {
  return { authenticated: true, user: "local.mock@edinstance.uk" };
}

export function mockLogin(): Session {
  return mockGetSession();
}

export function mockLogout(): void {
  return undefined;
}

export function mockListApps(): Array<PlatformApp> {
  return [...apps];
}

export function mockCreateApp(input: CreateAppInput): PlatformApp {
  const app: PlatformApp = {
    name: input.name,
    image: input.image,
    status: "active",
    ready: true,
    replicas: input.replicas ?? 1,
    port: input.port,
    healthPath: input.healthPath ?? "/health",
    domains: (input.domains ?? []).map((host) => ({
      host,
      scope: host.includes("local") ? "local" : "public",
      status: "provisioning",
    })),
    lastBuild: "just now",
    source: "local mock",
    updatedAt: new Date().toISOString(),
  };
  apps = [app, ...apps.filter((item) => item.name !== app.name)];
  return app;
}

export function mockUpdateAppHealthPath(
  name: string,
  healthPath: string,
): PlatformApp {
  const app = apps.find((item) => item.name === name);
  if (!app) throw new Error("App not found");
  const updated = { ...app, healthPath, status: "reconciling", ready: false };
  apps = apps.map((item) => (item.name === name ? updated : item));
  return updated;
}

export function mockDeleteApp(name: string): void {
  apps = apps.filter((app) => app.name !== name);
}

export function mockRedeployApp(name: string): void {
  apps = apps.map((app) =>
    app.name === name
      ? {
          ...app,
          status: "reconciling",
          failureReason: undefined,
          updatedAt: new Date().toISOString(),
        }
      : app,
  );
}

export function mockGetAppMetrics(name: string, hours: number): AppMetrics {
  return {
    rangeHours: hours,
    series: {
      cpu: metricSeries(name, hours, "cpu"),
      memory: metricSeries(name, hours, "memory"),
    },
  };
}

export function mockGetAppLogs(name: string, limit = 150): Array<LogEntry> {
  const levels: Array<LogEntry["level"]> = ["info", "info", "debug", "warn"];
  return Array.from({ length: Math.min(limit, 80) }, (_, index) => ({
    timestamp: new Date(Date.now() - index * 4 * 60_000).toISOString(),
    namespace: namespaceFor(name),
    pod: `${name}-${podSuffix(index % 3)}`,
    container: name,
    level: levels[index % levels.length],
    message:
      index % 11 === 0
        ? "retrying upstream request after transient timeout"
        : `handled request ${200 + (index % 20)} in ${18 + index * 3}ms`,
  }));
}

export function mockUploadEnvFile(
  name: string,
  content: string,
): EnvUploadResult {
  const parsed = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => ({ name: line.split("=")[0], secret: true }));
  envVars[name] = mergeEnv(envVars[name] ?? [], parsed);
  return { env: parsed };
}

export function mockListEnvVars(name: string): Array<EnvVariable> {
  return [...(envVars[name] ?? [])];
}

export function mockSetEnvVar(app: string, name: string, value = ""): EnvVariable {
  const variable = { name, secret: true };
  envVars[app] = mergeEnv(envVars[app] ?? [], [variable]);
  envValues[app] = { ...(envValues[app] ?? {}), [name]: value };
  return variable;
}

export function mockGetEnvVar(app: string, name: string): string {
  return envValues[app]?.[name] ?? `mock-${name.toLowerCase()}`;
}

export function mockDeleteEnvVar(app: string, name: string): void {
  envVars[app] = (envVars[app] ?? []).filter((item) => item.name !== name);
}

export function mockListDatabases(): Array<PostgresDatabase> {
  return [...databases];
}

export function mockCreateDatabase(
  input: CreatePostgresInput,
): PostgresDatabase {
  const database: PostgresDatabase = {
    ...input,
    namespace: `database-${input.name}`,
    host: `${input.name}-rw.database-${input.name}.svc.cluster.local`,
    credentialsSecret: `${input.name}-credentials`,
    status: "creating",
  };
  databases = [
    database,
    ...databases.filter((item) => item.name !== database.name),
  ];
  databasePasswords[input.name] = input.password;
  return database;
}

export function mockGetDatabaseCredentials(name: string): PostgresCredentials {
  const database = databases.find((item) => item.name === name);
  if (!database) throw new Error("Database not found");
  const password = databasePasswords[name] ?? "mock-password";
  const host = database.public && database.publicHostname
    ? database.publicHostname
    : database.host;
  return {
    host,
    port: 5432,
    database: database.database,
    username: database.owner,
    password,
    url: `postgresql://${encodeURIComponent(database.owner)}:${encodeURIComponent(password)}@${host}:5432/${encodeURIComponent(database.database)}?sslmode=require`,
  };
}

function metricSeries(
  name: string,
  hours: number,
  kind: "cpu" | "memory",
): AppMetrics["series"]["cpu"] {
  const app = apps.find((item) => item.name === name);
  const replicas = Math.max(app?.replicas ?? 3, 1);
  const end = Math.floor(Date.now() / 1000);
  const step = Math.max(Math.floor((hours * 60 * 60) / 32), 60);
  const start = end - hours * 60 * 60;

  return Array.from({ length: replicas }, (_unused, replica) => ({
    pod: `${name}-${podSuffix(replica)}`,
    values: Array.from({ length: 33 }, (_, index) => {
      const timestamp = start + index * step;
      const wave = Math.sin(index / 4 + replica * 0.8);
      const drift = index / 80;
      const value =
        kind === "cpu"
          ? 0.25 + replica * 0.08 + wave * 0.18 + drift
          : (120 + replica * 46 + wave * 28 + index * 3) * 1024 * 1024;
      return [timestamp, Math.max(value, 0)];
    }),
  }));
}

function mergeEnv(
  current: Array<EnvVariable>,
  next: Array<EnvVariable>,
): Array<EnvVariable> {
  const byName = new Map(current.map((item) => [item.name, item]));
  next.forEach((item) => byName.set(item.name, item));
  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function namespaceFor(name: string) {
  return name.startsWith("platform-") ? "platform-system" : `app-${name}`;
}

function podSuffix(index: number) {
  return ["rs2ph", "ckm2k", "vsj9b", "m7wms"][index] ?? `pod${index}`;
}
