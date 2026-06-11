# platform-api

Small REST API for the edinstance platform UI.

Current endpoints:

- `GET /healthz`
- `GET /api/session`
- `POST /api/session`
- `DELETE /api/session`
- `GET /api/apps`
- `POST /api/apps`
- `GET /api/apps/{name}`
- `DELETE /api/apps/{name}`
- `POST /api/apps/{name}/env-file`

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

When enabled, app creation and env uploads reconcile:

- `Secret`
- `Deployment`
- `Service`
- `HTTPRoute`
- `NetworkPolicy`

DB-backed `GET /api/apps` and `GET /api/apps/{name}` refresh service status
from the Kubernetes Deployment before returning data. A service becomes `ready`
when the Deployment has the desired updated and available replicas.

DB-backed `DELETE /api/apps/{name}` removes generated runtime resources when
reconciliation is enabled, then removes the service record from the database.

Next integrations:

- add Kubernetes RBAC/deployment manifests for `platform-api`
- launch BuildKit jobs that push images to GHCR
- manage Cloudflare public hostnames under `*.edinstance.uk`
