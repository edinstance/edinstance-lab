const DEFAULT_PLATFORM_API_URL = 'http://localhost:8080'

type FrontendEnv = {
  platformApiUrl: string
}

function readUrl(value: string | undefined, fallback: string): string {
  const rawValue = value?.trim() || fallback

  try {
    const url = new URL(rawValue)
    return url.toString().replace(/\/$/, '')
  } catch {
    throw new Error(`Invalid VITE_PLATFORM_API_URL: ${rawValue}`)
  }
}

export const env: FrontendEnv = {
  platformApiUrl: readUrl(import.meta.env.VITE_PLATFORM_API_URL, DEFAULT_PLATFORM_API_URL),
}
