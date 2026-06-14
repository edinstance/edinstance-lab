import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (process.env.VITE_MOCK_PLATFORM === "true") {
          return Response.json({ session: null }, { status: 200 });
        }

        const { auth } = await import("../../../lib/auth");
        return auth.handler(request);
      },
      POST: async ({ request }: { request: Request }) => {
        if (process.env.VITE_MOCK_PLATFORM === "true") {
          return Response.json({ ok: true }, { status: 200 });
        }

        const { auth } = await import("../../../lib/auth");
        return auth.handler(request);
      },
    },
  },
});
