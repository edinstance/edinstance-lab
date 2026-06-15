# Frontend

## Local PostgreSQL access

Databases configured for local exposure receive a MetalLB address on port
5432 and must use a hostname under `*.local.edinstance.uk`, for example
`db.local.edinstance.uk`. These PostgreSQL endpoints are available only on the
local network through split DNS. They are not routed through Envoy HTTP routes
or Cloudflare Tunnel.

## Local mock mode

Run the management UI without a Kubernetes cluster, platform API, or auth
database:

```sh
npm run dev:mock
```

This sets `VITE_MOCK_PLATFORM=true`. In mock mode the frontend API client uses
in-memory sample apps, databases, metrics, logs, and environment variables, and
the auth route returns a mock response instead of loading Better Auth.

Open `http://localhost:3000/manage`.
