import type { Dispatch, SetStateAction } from "react";

import type { EnvVariable, PostgresDatabase } from "../../platform/api";
import type { PlatformApp } from "../../topology/topology";
import type { useManageController } from "./useManageController";

export interface AppForm {
  name: string;
  image: string;
  port: string;
  replicas: string;
  healthPath: string;
  domains: string;
  envContent: string;
}
export interface DatabaseForm {
  name: string;
  database: string;
  owner: string;
  password: string;
  version: string;
  instances: string;
  storageSize: string;
  poolerEnabled: boolean;
  poolerInstances: string;
  poolMode: "session" | "transaction";
  public: boolean;
  publicHostname: string;
  restrictPublicSources: boolean;
  publicSourceCidrs: string;
}
export interface EnvDraft {
  name: string;
  value: string;
}
export type Setter<T> = Dispatch<SetStateAction<T>>;
export interface ManageState {
  apps: Array<PlatformApp>;
  databases: Array<PostgresDatabase>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  notice: string | null;
  busyApp: string | null;
  busyDatabase: string | null;
  envApp: string | null;
  envVars: Record<string, Array<EnvVariable>>;
  form: AppForm;
  databaseForm: DatabaseForm;
  envDraft: EnvDraft;
  setForm: Setter<AppForm>;
  setDatabaseForm: Setter<DatabaseForm>;
  setEnvDraft: Setter<EnvDraft>;
}

export type ManageController = ReturnType<typeof useManageController>;
