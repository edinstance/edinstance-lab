# Frontend

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
