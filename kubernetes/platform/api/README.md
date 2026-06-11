# platform-api deployment

This package deploys `platform-api` into `platform-system`.

Before enabling it in Flux, create a SOPS-encrypted Secret named
`platform-api-config` in the `platform-system` namespace. Use
`secret.example.yml` as the shape.

Required keys:

```text
database-name
database-user
database-password
encryption-key
auth-jwks-url
auth-issuer
auth-audience
```

The API verifies frontend-issued platform JWTs against
`PLATFORM_AUTH_JWKS_URL`, `PLATFORM_AUTH_ISSUER`, and
`PLATFORM_AUTH_AUDIENCE`. The JWKS URL should point at the frontend Better Auth
JWT plugin endpoint, for example `/api/auth/jwks`.

The database URL should point at the CloudNativePG PgBouncer read/write pooler:

```text
platform-db-pooler-rw.platform-db.svc.cluster.local:5432
```

Do not commit the plaintext example file as a live resource. The encrypted
`kubernetes/secrets/platform-api-config.sops.yml` file also includes the
matching `platform-db/platform-db-app` bootstrap credentials used by
CloudNativePG.

The Deployment image should use an immutable git SHA tag:

```text
ghcr.io/edinstance/edinstance-lab/platform-api:sha-ebb80dc
```

Use `scripts/build-platform-api-image.sh` to build and push the image for the
current commit, then update `deployment.yml` to the matching `sha-<short-sha>`
tag.
