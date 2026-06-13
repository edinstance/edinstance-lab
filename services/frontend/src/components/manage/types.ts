import type { Dispatch, SetStateAction } from "react";

import type { EnvVariable, PostgresDatabase } from "../../platform/api";
import type { PlatformApp } from "../../topology/topology";

export type AppForm = { name: string; image: string; port: string; replicas: string; domains: string };
export type DatabaseForm = {
  name: string; database: string; owner: string; password: string; version: string;
  instances: string; storageSize: string; poolerEnabled: boolean; poolerInstances: string;
  poolMode: "session" | "transaction"; public: boolean; publicHostname: string;
  restrictPublicSources: boolean; publicSourceCidrs: string;
};
export type EnvDraft = { name: string; value: string };
export type Setter<T> = Dispatch<SetStateAction<T>>;
export type ManageState = {
  apps: PlatformApp[]; databases: PostgresDatabase[]; loading: boolean; saving: boolean;
  error: string | null; notice: string | null; busyApp: string | null; envApp: string | null;
  envVars: Record<string, EnvVariable[]>; form: AppForm; databaseForm: DatabaseForm;
  envDraft: EnvDraft; setForm: Setter<AppForm>; setDatabaseForm: Setter<DatabaseForm>;
  setEnvDraft: Setter<EnvDraft>;
};
