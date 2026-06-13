import { jwtClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const frontendEnv = import.meta.env as Record<string, string | undefined>;

export const authClient = createAuthClient({
  baseURL: frontendEnv.VITE_AUTH_BASE_URL,
  plugins: [jwtClient()],
});
