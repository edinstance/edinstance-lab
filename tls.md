# TLS And cert-manager

Use cert-manager with Let's Encrypt DNS-01 validation through Cloudflare for the local Envoy Gateway names under `*.local.edinstance.com`.

DNS-01 is the right fit because the cluster uses Cloudflare Tunnel for public access and may not have direct inbound HTTP access from the internet. DNS validation only needs permission to create temporary TXT records in Cloudflare.

## Files

```text
kubernetes/addons/cert-manager/values.yml
kubernetes/addons/cert-manager/issuers.yml
kubernetes/addons/cert-manager/wildcard-certificate.yml
kubernetes/secrets/cloudflare-api-token.example.yml
```

## Pinned Version

```text
cert-manager chart: v1.20.2
```

The chart is referenced from the cert-manager OCI registry in `helmfile.yaml`.

## Cloudflare API Token

Create a Cloudflare API token with DNS edit access for the `edinstance.com` zone.

Recommended minimum permissions:

```text
Zone -> DNS -> Edit
Zone -> Zone -> Read
```

Scope it only to:

```text
edinstance.com
```

Store it as a SOPS-encrypted Kubernetes Secret named:

```text
cloudflare-api-token
```

in namespace:

```text
cert-manager
```

See `secrets.md` for the SOPS workflow.

## Install cert-manager

```bash
helmfile sync --selector name=cert-manager
```

Or directly:

```bash
helm upgrade --install cert-manager oci://quay.io/jetstack/charts/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.20.2 \
  --values kubernetes/addons/cert-manager/values.yml
```

## Apply Cloudflare Secret

```bash
sops --decrypt kubernetes/secrets/cloudflare-api-token.sops.yml | kubectl apply -f -
```

## Apply Issuers

Start with staging:

```bash
kubectl apply -f kubernetes/addons/cert-manager/issuers.yml
kubectl get clusterissuer
```

Use the staging issuer first while testing to avoid Let's Encrypt rate limits.

## Wildcard Certificate

The repo includes a wildcard certificate request:

```text
kubernetes/addons/cert-manager/wildcard-certificate.yml
```

It requests:

```text
local.edinstance.com
*.local.edinstance.com
```

and writes the TLS secret to:

```text
gateway-system/local-edinstance-com-wildcard-tls
```

Apply it only after cert-manager and the Cloudflare API token are working:

```bash
kubectl apply -f kubernetes/addons/cert-manager/wildcard-certificate.yml
```

Check:

```bash
kubectl -n gateway-system get certificate,secret
kubectl get challenge,order -A
```

## Gateway TLS

The current Gateway is HTTP-only. After the wildcard certificate exists, update Envoy Gateway to add HTTPS listeners that reference:

```text
local-edinstance-com-wildcard-tls
```

Keep HTTP during early bootstrap. Add HTTPS for local services when the
certificate is ready.

## Public TLS

Cloudflare handles browser-facing TLS for published `*.lab.edinstance.com`
hostnames. The tunnel can send traffic to internal Kubernetes services over
HTTP unless a service requires end-to-end TLS.
