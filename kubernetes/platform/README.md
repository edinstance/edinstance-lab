# Platform API

This directory holds the Kubernetes-facing contract for the custom control
plane.

The first API is `platform.edinstance.com/v1alpha1` `App`. The UI should create
or update `App` objects through a platform API. A controller can then render
Deployments, Services, HTTPRoutes, NetworkPolicies, and observability settings.

The example in `examples/whoami-app.yml` mirrors the current manual whoami
deployment and is the first target for a controller implementation.
