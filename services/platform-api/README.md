# platform-api

Small REST API for the edinstance platform UI.

Current endpoints:

- `GET /healthz`
- `GET /api/apps`
- `POST /api/apps`
- `GET /api/apps/{name}`
- `DELETE /api/apps/{name}`
- `POST /api/apps/{name}/env-file`

All `/api/apps` endpoints require an `Authorization: Bearer <jwt>` header. The
frontend gets this JWT from Better Auth after the user signs in; the API verifies
it against the configured JWKS endpoint, issuer, and audience.

Development defaults:

- address: `:8080`
- `PLATFORM_AUTH_JWKS_URL` must point at the frontend auth JWKS endpoint
- `PLATFORM_AUTH_ISSUER` and `PLATFORM_AUTH_AUDIENCE` must match the frontend JWT plugin
- app data is in-memory unless `PLATFORM_DATABASE_URL` is set

Database-backed mode:

- `PLATFORM_DATABASE_URL` connects to Postgres and runs embedded migrations at startup
- `PLATFORM_ENCRYPTION_KEY` enables encrypted env file storage

`PLATFORM_ENCRYPTION_KEY` must be valid base64 that decodes to 16, 24, or 32
bytes.

Kubernetes reconciliation:

- `PLATFORM_RECONCILE_ENABLED=true` enables runtime resource reconciliation
- `PLATFORM_APPS_NAMESPACE` defaults to `apps`
- `PLATFORM_GATEWAY_NAMESPACE` defaults to `gateway-system`
- `PLATFORM_GATEWAY_NAME` defaults to `main-gateway`
- `PLATFORM_GATEWAY_SECTION_NAME` defaults to `http-local`
- `KUBECONFIG` can be used for local development; in-cluster config is used otherwise

When enabled, app creation and env uploads enqueue durable reconciliation for:

- `Secret`
- `Deployment`
- `Service`
- `HTTPRoute`
- `NetworkPolicy`

DB-backed `GET /api/apps` and `GET /api/apps/{name}` refresh service status
from the Kubernetes Deployment before returning data. A service becomes `ready`
when the Deployment has the desired updated and available replicas.

The reconciliation worker uses database leases, so multiple API replicas can safely
process work. Failed operations retry with exponential backoff, successful apps are
periodically reapplied to repair cluster drift, and deletion keeps a database
tombstone until all generated runtime resources have been removed.

DB-backed `DELETE /api/apps/{name}` returns `202` after marking the app as deleting.
The worker removes generated runtime resources and only then removes the database
record.

Next integrations:

- add Kubernetes RBAC/deployment manifests for `platform-api`
- launch BuildKit jobs that push images to GHCR
- manage Cloudflare public hostnames under `*.edinstance.uk`
