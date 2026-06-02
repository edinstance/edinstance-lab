# TLS And cert-manager

Use cert-manager with Let's Encrypt DNS-01 validation through Cloudflare for the local Envoy Gateway names under `*.local.edinstance.uk`.

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

Create a Cloudflare API token with DNS edit access for the `edinstance.uk` zone.

Recommended minimum permissions:

```text
Zone -> DNS -> Edit
Zone -> Zone -> Read
```

Scope it only to:

```text
edinstance.uk
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
cp kubernetes/secrets/cloudflare-api-token.example.yml /tmp/cloudflare-api-token.yml
$EDITOR /tmp/cloudflare-api-token.yml
sops --encrypt /tmp/cloudflare-api-token.yml > kubernetes/secrets/cloudflare-api-token.sops.yml
rm /tmp/cloudflare-api-token.yml
```

Then add `cloudflare-api-token.sops.yml` to `kubernetes/secrets/kustomization.yml`
so Flux applies it through the SOPS-enabled `secrets` Kustomization.

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
local.edinstance.uk
*.local.edinstance.uk
```

and writes the TLS secret to:

```text
gateway-system/local-edinstance-uk-wildcard-tls
```

The certificate is included in the addons kustomization and is applied by Flux
after the SOPS-managed Cloudflare API token exists.

```bash
flux reconcile kustomization secrets -n flux-system --with-source
flux reconcile kustomization addons -n flux-system --with-source
```

Check:

```bash
kubectl -n gateway-system get certificate,secret
kubectl get challenge,order -A
```

## Gateway TLS

The Gateway includes an HTTPS listener for local names that references:

```text
local-edinstance-uk-wildcard-tls
```

Keep HTTP enabled during bootstrap. The HTTPS listener becomes valid once
cert-manager creates the referenced wildcard TLS secret.

## Public TLS

Cloudflare handles browser-facing TLS for published `*.lab.edinstance.uk`
hostnames. The tunnel can send traffic to internal Kubernetes services over
HTTP unless a service requires end-to-end TLS.
