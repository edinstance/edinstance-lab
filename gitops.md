# GitOps And Control Plane Plan

The long-term goal is a custom Railway-like control plane, not a Kubernetes UI
for operators. The UI should expose platform concepts such as apps, domains,
environment variables, deployments, logs, metrics, and traces. Kubernetes
objects stay behind that API.

## Target Architecture

```text
custom UI
  -> platform API
  -> App CRDs or generated Git commits
  -> Flux reconciles desired state
  -> Kubernetes resources
```

Flux should be the GitOps reconciler underneath the platform. Argo CD is useful
when its UI is the main operator workflow, but it is less useful here because
the custom UI should become the product surface.

## Platform Boundary

The custom control plane should manage a small app-level API first:

```yaml
apiVersion: platform.edinstance.com/v1alpha1
kind: App
metadata:
  name: whoami
  namespace: apps
spec:
  image: traefik/whoami:v1.11.0
  port: 8080
  domains:
    - whoami.local.edinstance.com
  resources:
    cpu: 100m
    memory: 128Mi
  env:
    - name: EXAMPLE
      valueFromSecret: example-secret
```

The platform implementation can turn that into:

```text
Deployment
Service
HTTPRoute
NetworkPolicy
Certificate references
Secret references
ServiceMonitor or PodMonitor
OpenTelemetry annotations/config
```

Do not make users create raw Deployments, Services, HTTPRoutes, or
NetworkPolicies from the UI. Those are implementation details.

## GitOps Ownership

GitOps should eventually own:

```text
kubernetes/addons/*
kubernetes/platform/*
apps/*
kubernetes/secrets/*.sops.yml
```

Keep initial machine bootstrap outside GitOps:

```text
ansible/*
kubernetes/bootstrap/kubeadm-config.yml
```

## Recommended Repo Shape

```text
kubernetes/
  addons/
    flux/
    cert-manager/
    cilium/
    cloudflare-tunnel/
    envoy-gateway/
    grafana/
    prometheus/
    opentelemetry/
  platform/
    crds/
    controller/
    examples/
  secrets/
apps/
  _template/
  whoami/
```

## Observability Stack

Install observability before building too much of the UI. The control plane will
need these signals:

1. `kube-prometheus-stack` for Prometheus, Alertmanager, kube-state-metrics, and
   Grafana.
2. OpenTelemetry Collector for OTLP ingest and future trace/log/metric routing.
3. Loki or Grafana Alloy later for application logs if Kubernetes log access is
   not enough.

Grafana can be exposed through Gateway API and protected with Cloudflare Access
for public access.

## Suggested Migration Path

1. Finish the base cluster: Cilium, MetalLB, Envoy Gateway, Longhorn,
   cert-manager, Cloudflare Tunnel, and SOPS secrets.
2. Install Flux controllers and let Flux reconcile this repo.
3. Convert Helm-managed base addons into Flux `HelmRepository` and `HelmRelease`
   resources.
4. Add `kube-prometheus-stack` and OpenTelemetry Collector.
5. Create an `apps/_template` folder for manually onboarded services.
6. Move `whoami` into the app template structure.
7. Define the first `App` CRD shape under `kubernetes/platform/crds`.
8. Build a small platform API that can create/update `App` resources.
9. Build the UI against the platform API.
10. Add a controller that watches `App` resources and renders the lower-level
    Kubernetes resources.

The repo now has the initial Flux sync skeleton, observability addon manifests,
OpenTelemetry Collector manifests, an app template, and the first `App` CRD.
Before enabling reconciliation, replace the placeholder Git URL in
`kubernetes/addons/flux/source.yml` and create the Flux deploy key secret.

## First UI Capabilities

Keep the first version narrow:

1. List apps and deployment status.
2. Create an app from an image, port, and domain.
3. Update image tag and trigger rollout.
4. Manage plain environment variables and secret references.
5. Show pod logs.
6. Link to Grafana dashboards for app metrics.

Add builds, GitHub integration, preview environments, databases, and billing-like
resource views later.

## Guardrails

The platform should enforce defaults instead of asking users to remember them:

```text
non-root containers
resource requests and limits
readiness and liveness probes
default-deny NetworkPolicies
explicit HTTPRoute attachment
service account per app
SOPS or external secret handling
standard metrics labels
```
