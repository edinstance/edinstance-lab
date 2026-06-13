import type { PlatformApp } from '../topology/topology'
import { env } from '../env'
import { authClient } from '../lib/auth-client'

export type Session = {
  authenticated: boolean
  user?: string
}

export type CreateAppInput = {
  name: string
  image: string
  port: number
  replicas?: number
  domains?: string[]
}

export type EnvUploadResult = {
  env: Array<{
    name: string
    secret: boolean
  }>
}

export type EnvVariable = { name: string; secret: boolean }

export type PostgresDatabase = {
  name: string
  namespace: string
  database: string
  owner: string
  version: string
  instances: number
  storageSize: string
  poolerEnabled: boolean
  poolerInstances: number
  poolMode: 'session' | 'transaction'
  public: boolean
  publicHostname?: string
  publicSourceCidrs?: string[]
  host: string
  credentialsSecret: string
  status: string
}

export type CreatePostgresInput = Omit<PostgresDatabase, 'namespace' | 'host' | 'credentialsSecret' | 'status'> & { password: string }

const apiBase = env.platformApiUrl
const requestTimeoutMs = 10_000

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error || fallback
  } catch {
    return fallback
  }
}

export async function getSession(): Promise<Session> {
  const session = await authClient.getSession()
  if (!session.data?.user?.email) {
    return { authenticated: false }
  }
  return { authenticated: true, user: session.data.user.email }
}

export async function login(email: string, password: string): Promise<Session> {
  requireSecureConnection()
  const result = await authClient.signIn.email({
    email,
    password,
  })
  if (result.error) {
    throw new Error(result.error.message || 'Invalid credentials')
  }
  return { authenticated: true, user: result.data.user.email }
}

export async function signup(input: { name: string; email: string; password: string; platformPassword: string }): Promise<Session> {
  requireSecureConnection()
  const result = await authClient.signUp.email({
    name: input.name,
    email: input.email,
    password: input.password,
    fetchOptions: {
      headers: {
        'x-platform-signup-password': input.platformPassword,
      },
    },
  })
  if (result.error) {
    throw new Error(result.error.message || 'Unable to create account')
  }
  return { authenticated: true, user: result.data.user.email }
}

export async function logout(): Promise<void> {
  await authClient.signOut()
}

export async function listApps(): Promise<PlatformApp[]> {
  const response = await apiFetch(`${apiBase}/api/apps`, {
    headers: await authHeaders(),
  })
  if (response.status === 401) throw new Error('Your session has expired; sign in again')
  if (!response.ok) {
    throw new Error('Unable to load platform apps')
  }
  const body = (await response.json()) as { apps: PlatformApp[] }
  return body.apps
}

export async function createApp(input: CreateAppInput): Promise<PlatformApp> {
  const response = await apiFetch(`${apiBase}/api/apps`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(await readError(response, 'Unable to create app'))
  }
  return response.json() as Promise<PlatformApp>
}

export async function deleteApp(name: string): Promise<void> {
  const response = await apiFetch(`${apiBase}/api/apps/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!response.ok) {
    throw new Error(await readError(response, 'Unable to delete app'))
  }
}

export async function uploadEnvFile(name: string, content: string): Promise<EnvUploadResult> {
  const response = await apiFetch(`${apiBase}/api/apps/${encodeURIComponent(name)}/env-file`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) {
    throw new Error(await readError(response, 'Unable to upload env file'))
  }
  return response.json() as Promise<EnvUploadResult>
}

export async function listEnvVars(name: string): Promise<EnvVariable[]> {
  const response = await apiFetch(`${apiBase}/api/apps/${encodeURIComponent(name)}/env`, { headers: await authHeaders() })
  if (!response.ok) throw new Error(await readError(response, 'Unable to load environment variables'))
  return ((await response.json()) as { env: EnvVariable[] }).env
}

export async function setEnvVar(app: string, name: string, value: string): Promise<EnvVariable> {
  const response = await apiFetch(`${apiBase}/api/apps/${encodeURIComponent(app)}/env/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!response.ok) throw new Error(await readError(response, 'Unable to save environment variable'))
  return response.json() as Promise<EnvVariable>
}

export async function deleteEnvVar(app: string, name: string): Promise<void> {
  const response = await apiFetch(`${apiBase}/api/apps/${encodeURIComponent(app)}/env/${encodeURIComponent(name)}`, {
    method: 'DELETE', headers: await authHeaders(),
  })
  if (!response.ok) throw new Error(await readError(response, 'Unable to delete environment variable'))
}

export async function listDatabases(): Promise<PostgresDatabase[]> {
  const response = await apiFetch(`${apiBase}/api/databases`, { headers: await authHeaders() })
  if (!response.ok) throw new Error(await readError(response, 'Unable to load databases'))
  return ((await response.json()) as { databases: PostgresDatabase[] }).databases
}

export async function createDatabase(input: CreatePostgresInput): Promise<PostgresDatabase> {
  const response = await apiFetch(`${apiBase}/api/databases`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await readError(response, 'Unable to create database'))
  return response.json() as Promise<PostgresDatabase>
}

async function authHeaders(): Promise<Record<string, string>> {
  const result = await authClient.token()
  const token = result.data?.token
  if (!token) {
    return {}
  }
  return { Authorization: `Bearer ${token}` }
}

function requireSecureConnection(): void {
  const { protocol, hostname } = window.location
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  if (protocol !== 'https:' && !isLocalhost) {
    throw new Error('Refusing to send credentials over an insecure connection; use HTTPS')
  }
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Platform API request timed out')
    }
    throw new Error('Unable to reach the platform API')
  } finally {
    window.clearTimeout(timeout)
  }
}
