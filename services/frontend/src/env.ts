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
    console.debug('VITE_PLATFORM_API_URL is not a parseable URL (value redacted, length %d)', rawValue.length)
    throw new Error('Invalid VITE_PLATFORM_API_URL')
  }
}

export const env: FrontendEnv = {
  platformApiUrl: readUrl(import.meta.env.VITE_PLATFORM_API_URL, DEFAULT_PLATFORM_API_URL),
}
