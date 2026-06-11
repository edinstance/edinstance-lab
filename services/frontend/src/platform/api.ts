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

const apiBase = env.platformApiUrl

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

export async function login(password: string): Promise<Session> {
  const response = await fetch('/api/platform-login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    throw new Error('Invalid credentials')
  }
  return response.json() as Promise<Session>
}

export async function logout(): Promise<void> {
  await authClient.signOut()
}

export async function listApps(): Promise<PlatformApp[]> {
  const response = await fetch(`${apiBase}/api/apps`, {
    headers: await authHeaders(),
  })
  if (response.status === 401) {
    return []
  }
  if (!response.ok) {
    throw new Error('Unable to load platform apps')
  }
  const body = (await response.json()) as { apps: PlatformApp[] }
  return body.apps
}

export async function createApp(input: CreateAppInput): Promise<PlatformApp> {
  const response = await fetch(`${apiBase}/api/apps`, {
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
  const response = await fetch(`${apiBase}/api/apps/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!response.ok) {
    throw new Error(await readError(response, 'Unable to delete app'))
  }
}

export async function uploadEnvFile(name: string, content: string): Promise<EnvUploadResult> {
  const response = await fetch(`${apiBase}/api/apps/${encodeURIComponent(name)}/env-file`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) {
    throw new Error(await readError(response, 'Unable to upload env file'))
  }
  return response.json() as Promise<EnvUploadResult>
}

async function authHeaders(): Promise<Record<string, string>> {
  const result = await authClient.token()
  const token = result.data?.token
  if (!token) {
    return {}
  }
  return { Authorization: `Bearer ${token}` }
}
