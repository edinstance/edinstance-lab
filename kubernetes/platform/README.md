# Platform API

This directory holds the Kubernetes-facing contract for the custom control
plane.

The first API is `platform.edinstance.uk/v1alpha1` `App`. The UI should create
or update `App` objects through a platform API. A controller can then render
Deployments, Services, HTTPRoutes, NetworkPolicies, and observability settings.

The example in `examples/sample-app.yml` shows the desired platform-managed app
shape. It is the first target for a controller implementation.

## Database Bootstrap

CloudNativePG expects an app-owner Secret named `platform-db-app` in the
`platform-db` namespace before `database/cluster.yml` is applied. Create it
from a password manager or SOPS-managed secret with these keys:

- `username`: database owner, currently `app`
- `password`: generated strong password for the app owner

`database/secret.example.yml` documents the required shape. Do not apply the
example value to a real cluster.
