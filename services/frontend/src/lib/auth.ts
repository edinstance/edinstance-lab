import { timingSafeEqual } from 'node:crypto'

import { betterAuth, type BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { APIError } from 'better-auth/api'
import { getMigrations } from 'better-auth/db/migration'
import { jwt } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Pool } from 'pg'

import { clientIp, type FailedAttempts, incrementFailure, isBlocked, resetFailures } from './rate-limit'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

const authDatabase = new Pool({
  host: requiredEnv('PLATFORM_DATABASE_HOST'),
  database: requiredEnv('PLATFORM_DATABASE_NAME'),
  user: requiredEnv('PLATFORM_DATABASE_USER'),
  password: requiredEnv('PLATFORM_DATABASE_PASSWORD'),
  port: Number(process.env.PLATFORM_DATABASE_PORT ?? '5432'),
  max: 5,
})

const signupPasswordWindowMs = 15 * 60 * 1000
const maxFailedSignupPasswords = 5
const failedSignupPasswords: FailedAttempts = new Map()

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
  database: authDatabase,
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

const migrations = await getMigrations(auth.options)
await migrations.runMigrations()

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} must be set`)
  }
  return value
}

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
            if (isBlocked(failedSignupPasswords, ip, maxFailedSignupPasswords)) {
              throw APIError.from('TOO_MANY_REQUESTS', { code: 'TOO_MANY_SIGN_UP_PASSWORD_ATTEMPTS', message: 'Too many sign-up password attempts' })
            }

            const password = headers.get('x-platform-signup-password') ?? ''
            if (!isEqualConstantTime(password, getAdminPassword())) {
              incrementFailure(failedSignupPasswords, ip, signupPasswordWindowMs)
              throw APIError.from('FORBIDDEN', { code: 'INVALID_SIGN_UP_PASSWORD', message: 'Invalid sign-up password' })
            }
            resetFailures(failedSignupPasswords, ip)
          }),
        },
      ],
    },
  }
}

export function isEqualConstantTime(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value)
  const expectedBuffer = Buffer.from(expected)
  const length = Math.max(valueBuffer.length, expectedBuffer.length)
  const paddedValue = Buffer.alloc(length)
  const paddedExpected = Buffer.alloc(length)

  valueBuffer.copy(paddedValue)
  expectedBuffer.copy(paddedExpected)

  return timingSafeEqual(paddedValue, paddedExpected) && valueBuffer.length === expectedBuffer.length
}
