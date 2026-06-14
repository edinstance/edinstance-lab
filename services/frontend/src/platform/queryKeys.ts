export const sessionQueryKey = ["session"] as const;
export const topologyQueryKey = ["topology"] as const;

export function appEnvVarsQueryKey(appName: string) {
  return ["app-env-vars", appName] as const;
}
