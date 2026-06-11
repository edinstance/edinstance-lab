import { jwtClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_BASE_URL || undefined,
  plugins: [jwtClient()],
})
