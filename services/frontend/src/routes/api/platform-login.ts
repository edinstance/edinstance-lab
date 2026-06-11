import { createFileRoute } from '@tanstack/react-router'

import { adminEmail, adminName, auth, getAdminPassword } from '../../lib/auth'

const loginWindowMs = 15 * 60 * 1000
const maxFailedLogins = 5
const failedLogins = new Map<string, { count: number; resetAt: number }>()

export const Route = createFileRoute('/api/platform-login')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const ip = clientIp(request)
        if (isBlocked(ip)) {
          return Response.json({ error: 'Too many failed login attempts' }, { status: 429 })
        }

        let body: { password?: string } | null
        try {
          body = (await request.json()) as { password?: string } | null
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const password = body?.password ?? ''

        if (password !== getAdminPassword()) {
          incrementFailedLogin(ip)
          return Response.json({ error: 'Invalid credentials' }, { status: 401 })
        }

        await auth.api.signUpEmail({
          body: {
            email: adminEmail,
            name: adminName,
            password,
          },
          headers: new Headers({
            'x-platform-signup-password': password,
          }),
        }).catch((error: unknown) => {
          if (!isExistingUserSignUpError(error)) {
            throw error
          }
        })

        let signInResponse: Response
        try {
          signInResponse = await auth.api.signInEmail({
            asResponse: true,
            body: {
              email: adminEmail,
              password,
            },
          })
        } catch {
          incrementFailedLogin(ip)
          return Response.json({ error: 'Invalid credentials' }, { status: 401 })
        }

        resetFailedLogin(ip)
        const response = Response.json({
          authenticated: true,
          user: adminEmail,
        })
        for (const [name, value] of signInResponse.headers) {
          if (name.toLowerCase() === 'set-cookie') {
            response.headers.append(name, value)
          }
        }
        return response
      },
    },
  },
})

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown'
}

function isBlocked(ip: string): boolean {
  const attempt = failedLogins.get(ip)
  if (!attempt) {
    return false
  }
  if (Date.now() >= attempt.resetAt) {
    failedLogins.delete(ip)
    return false
  }
  return attempt.count >= maxFailedLogins
}

function incrementFailedLogin(ip: string): void {
  const now = Date.now()
  const attempt = failedLogins.get(ip)
  if (!attempt || now >= attempt.resetAt) {
    failedLogins.set(ip, { count: 1, resetAt: now + loginWindowMs })
    return
  }
  attempt.count += 1
}

function resetFailedLogin(ip: string): void {
  failedLogins.delete(ip)
}

function isExistingUserSignUpError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const body = 'body' in error ? (error as { body?: unknown }).body : undefined
  if (!body || typeof body !== 'object') {
    return false
  }
  return (body as { code?: unknown }).code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
}
