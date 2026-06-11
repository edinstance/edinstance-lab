import { createFileRoute } from '@tanstack/react-router'
import { APIError } from 'better-auth/api'

import { adminEmail, adminName, auth, getAdminPassword, isEqualConstantTime, updateAdminPassword } from '../../lib/auth'
import { clientIp, type FailedAttempts, incrementFailure, isBlocked, resetFailures } from '../../lib/rate-limit'

const loginWindowMs = 15 * 60 * 1000
const maxFailedLogins = 5
const failedLogins: FailedAttempts = new Map()

export const Route = createFileRoute('/api/platform-login')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const ip = clientIp(request.headers)
        if (isBlocked(failedLogins, ip, maxFailedLogins)) {
          return Response.json({ error: 'Too many failed login attempts' }, { status: 429 })
        }

        let body: { password?: string } | null
        try {
          body = (await request.json()) as { password?: string } | null
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const password = body?.password ?? ''

        const expected = getAdminPassword()
        if (!isEqualConstantTime(password, expected)) {
          incrementFailure(failedLogins, ip, loginWindowMs)
          return Response.json({ error: 'Invalid credentials' }, { status: 401 })
        }

        let signInResponse: Response | undefined
        try {
          await auth.api.signUpEmail({
            body: {
              email: adminEmail,
              name: adminName,
              password,
            },
            headers: new Headers({
              'x-platform-signup-password': password,
            }),
          })
        } catch (error: unknown) {
          if (!isExistingUserSignUpError(error)) {
            throw error
          }
          try {
            signInResponse = await signIn(password)
          } catch (signInError: unknown) {
            if (!isInvalidCredentialsError(signInError)) {
              throw signInError
            }
            await updateAdminPassword(password)
          }
        }

        if (!signInResponse) {
          try {
            signInResponse = await signIn(password)
          } catch (error: unknown) {
            if (!isInvalidCredentialsError(error)) {
              throw error
            }
            incrementFailure(failedLogins, ip, loginWindowMs)
            return Response.json({ error: 'Invalid credentials' }, { status: 401 })
          }
        }

        resetFailures(failedLogins, ip)
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

function signIn(password: string): Promise<Response> {
  return auth.api.signInEmail({
    asResponse: true,
    body: {
      email: adminEmail,
      password,
    },
  })
}

function isInvalidCredentialsError(error: unknown): boolean {
  return error instanceof APIError && error.body?.code === 'INVALID_EMAIL_OR_PASSWORD'
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
