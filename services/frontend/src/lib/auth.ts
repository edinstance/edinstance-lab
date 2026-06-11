import { timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { betterAuth, type BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { APIError } from 'better-auth/api'
import { jwt } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import Database from 'better-sqlite3'

const databasePath = resolve(process.cwd(), process.env.BETTER_AUTH_DATABASE_PATH ?? '.data/auth.sqlite')
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

mkdirSync(dirname(databasePath), { recursive: true })

export const adminEmail = process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@edinstance.local'
export const adminName = process.env.PLATFORM_ADMIN_NAME ?? 'edinstance admin'

const signupPasswordWindowMs = 15 * 60 * 1000
const maxFailedSignupPasswords = 5
const failedSignupPasswords = new Map<string, { count: number; resetAt: number }>()

const jwtOptions = {
  issuer: process.env.PLATFORM_AUTH_ISSUER ?? baseURL,
  audience: process.env.PLATFORM_AUTH_AUDIENCE ?? 'platform-api',
  expirationTime: '12h',
}

export function getAdminPassword() {
  const password = process.env.PLATFORM_ADMIN_PASSWORD
  if (!password) {
    throw new Error('PLATFORM_ADMIN_PASSWORD must be set')
  }
  return password
}

export const auth = betterAuth({
  appName: 'edinstance platform',
  baseURL,
  database: new Database(databasePath),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  plugins: [
    platformSignupPassword(),
    jwt({
      jwt: jwtOptions,
    }),
    tanstackStartCookies(),
  ],
})

function platformSignupPassword(): BetterAuthPlugin {
  return {
    id: 'platform-signup-password',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/sign-up/email',
          handler: createAuthMiddleware(async (ctx) => {
            const headers = ctx.headers!
            const ip = clientIp(headers)
            if (isSignupPasswordBlocked(ip)) {
              throw APIError.from('TOO_MANY_REQUESTS', { code: 'TOO_MANY_SIGN_UP_PASSWORD_ATTEMPTS', message: 'Too many sign-up password attempts' })
            }

            const password = headers.get('x-platform-signup-password') ?? ''
            if (!isEqualConstantTime(password, getAdminPassword())) {
              incrementFailedSignupPassword(ip)
              throw APIError.from('FORBIDDEN', { code: 'INVALID_SIGN_UP_PASSWORD', message: 'Invalid sign-up password' })
            }
            resetFailedSignupPassword(ip)
          }),
        },
      ],
    },
  }
}

function isEqualConstantTime(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value)
  const expectedBuffer = Buffer.from(expected)
  const length = Math.max(valueBuffer.length, expectedBuffer.length)
  const paddedValue = Buffer.alloc(length)
  const paddedExpected = Buffer.alloc(length)

  valueBuffer.copy(paddedValue)
  expectedBuffer.copy(paddedExpected)

  return timingSafeEqual(paddedValue, paddedExpected) && valueBuffer.length === expectedBuffer.length
}

function clientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || headers.get('x-real-ip') || 'unknown'
}

function isSignupPasswordBlocked(ip: string): boolean {
  const attempt = failedSignupPasswords.get(ip)
  if (!attempt) {
    return false
  }
  if (Date.now() >= attempt.resetAt) {
    failedSignupPasswords.delete(ip)
    return false
  }
  return attempt.count >= maxFailedSignupPasswords
}

function incrementFailedSignupPassword(ip: string): void {
  const now = Date.now()
  const attempt = failedSignupPasswords.get(ip)
  if (!attempt || now >= attempt.resetAt) {
    failedSignupPasswords.set(ip, { count: 1, resetAt: now + signupPasswordWindowMs })
    return
  }
  attempt.count += 1
}

function resetFailedSignupPassword(ip: string): void {
  failedSignupPasswords.delete(ip)
}
