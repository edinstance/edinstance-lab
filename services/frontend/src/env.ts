const DEFAULT_PLATFORM_API_URL = "http://localhost:8080";
const DEFAULT_GRAFANA_URL = "https://grafana.edinstance.uk";

interface FrontendEnv {
  grafanaUrl: string;
  mockPlatform: boolean;
  platformApiUrl: string;
}

function readUrl(
  name: string,
  value: string | undefined,
  fallback: string,
): string {
  const trimmedValue = value?.trim();
  const rawValue = trimmedValue?.length ? trimmedValue : fallback;

  try {
    const url = new URL(rawValue);
    return url.toString().replace(/\/$/, "");
  } catch {
    console.debug(
      "%s is not a parseable URL (value redacted, length %d)",
      name,
      rawValue.length,
    );
    throw new Error(`Invalid ${name}`);
  }
}

const frontendEnv = import.meta.env as Record<string, string | undefined>;

export const env: FrontendEnv = {
  grafanaUrl: readUrl(
    "VITE_GRAFANA_URL",
    frontendEnv.VITE_GRAFANA_URL,
    DEFAULT_GRAFANA_URL,
  ),
  mockPlatform: frontendEnv.VITE_MOCK_PLATFORM === "true",
  platformApiUrl: readUrl(
    "VITE_PLATFORM_API_URL",
    frontendEnv.VITE_PLATFORM_API_URL,
    DEFAULT_PLATFORM_API_URL,
  ),
};
