# Cluster Secrets Handling

Use two layers:

1. **Ansible bootstrap secrets** for the minimum data needed before Flux can
   reconcile.
2. **SOPS-encrypted Kubernetes Secret manifests** for ongoing cluster secrets in
   git.

Ansible should not become the long-term secret manager. Its job is to install
the first keys and unblock GitOps. After Flux is running, secret changes should
be made by editing encrypted files and committing them.

## What Ansible Should Bootstrap

Ansible can safely automate these one-time operations from the admin machine:

```text
install Flux controllers
create flux-system namespace
create Flux deploy key secret
create Flux SOPS age private-key secret
create initial grafana-admin secret if observability is enabled immediately
apply kubernetes/addons/flux
```

These are cluster bootstrap concerns. They are acceptable in Ansible because
Flux cannot pull or decrypt the repo until they exist.

This repo includes an optional bootstrap playbook:

```text
ansible/playbooks/04-flux-bootstrap.yml
```

Run it from the repo root after your kubeconfig points at the cluster:

```bash
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
export FLUX_GIT_IDENTITY_FILE="/path/to/flux-edinstance-lab"
export GRAFANA_ADMIN_PASSWORD='<strong-password>'

ansible-playbook ansible/playbooks/04-flux-bootstrap.yml
```

`FLUX_GIT_IDENTITY_FILE` should point at the private key file. The matching
public key must exist at the same path with `.pub` appended.

## What Flux Should Manage

Flux should manage ongoing secrets from encrypted manifests:

```text
kubernetes/secrets/*.sops.yml
```

Use this for:

```text
Cloudflare API token for cert-manager DNS-01
Cloudflare Tunnel token
Grafana admin secret
Longhorn backup credentials
application credentials
future platform API credentials
```

Do not commit plaintext Secret manifests.

## Files

```text
.sops.yaml
kubernetes/secrets/kustomization.yml
kubernetes/secrets/*.example.yml
kubernetes/secrets/*.sops.yml
```

The `.sops.yaml` file contains the age recipient used when encrypting real
secrets:

```text
REPLACE_WITH_AGE_PUBLIC_KEY
```

Replace it with your real age public key before creating real `.sops.yml` files.

## Install Local Tools

```bash
brew install sops age
```

Install Flux CLI if you want bootstrap helpers:

```bash
brew install fluxcd/tap/flux
```

## Create An Age Key

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
```

Print the public recipient:

```bash
grep '^# public key:' ~/.config/sops/age/keys.txt
```

Put the public key in `.sops.yaml`.

Keep `~/.config/sops/age/keys.txt` private. It decrypts every repository secret
encrypted to that recipient.

## Create Flux SOPS Secret

Flux needs the age private key in-cluster to decrypt SOPS files:

```bash
kubectl create namespace flux-system
kubectl -n flux-system create secret generic sops-age \
  --from-file=age.agekey="$HOME/.config/sops/age/keys.txt"
```

The Flux Kustomizations in `kubernetes/gitops/sync/*.yml` reference this secret:

```yaml
decryption:
  provider: sops
  secretRef:
    name: sops-age
```

## Create Flux Deploy Key Secret

If Flux pulls this repo over SSH, create a deploy key:

```bash
ssh-keygen -t ed25519 -C flux-edinstance-lab -f /tmp/flux-edinstance-lab
```

Add `/tmp/flux-edinstance-lab.pub` as a read-only deploy key on the git
repository.

Create the Kubernetes secret expected by
`kubernetes/addons/flux/source.yml`:

```bash
kubectl -n flux-system create secret generic flux-system \
  --from-file=identity=/tmp/flux-edinstance-lab \
  --from-file=identity.pub=/tmp/flux-edinstance-lab.pub \
  --from-literal=known_hosts="$(ssh-keyscan github.com)"
```

Then remove the temporary private key:

```bash
rm /tmp/flux-edinstance-lab /tmp/flux-edinstance-lab.pub
```

## Encrypt A Kubernetes Secret

Copy an example outside the repo or to a temporary file:

```bash
cp kubernetes/secrets/grafana-admin.example.yml /tmp/grafana-admin.yml
```

Edit `/tmp/grafana-admin.yml` and replace placeholders.

Encrypt into the repo:

```bash
sops --encrypt /tmp/grafana-admin.yml > kubernetes/secrets/grafana-admin.sops.yml
```

Add the encrypted file to `kubernetes/secrets/kustomization.yml`:

```yaml
resources:
  - grafana-admin.sops.yml
```

Remove the plaintext temp file:

```bash
rm /tmp/grafana-admin.yml
```

## Edit An Existing Secret

```bash
sops kubernetes/secrets/grafana-admin.sops.yml
```

Flux will apply the decrypted Secret after the change is committed and pulled.

## Bootstrap Order

Recommended order:

1. Generate age key locally.
2. Replace the age recipient in `.sops.yaml`.
3. Create real encrypted secrets under `kubernetes/secrets`.
4. Install Flux controllers.
5. Create `flux-system` deploy key secret.
6. Create `flux-system/sops-age`.
7. Create any install-blocking bootstrap secret manually or with Ansible, such
   as `monitoring/grafana-admin`.
8. Apply `kubernetes/addons/flux`.
9. Let Flux reconcile `kubernetes/gitops/sync`.

After the first reconciliation, rotate bootstrap-created secrets into SOPS files
so git remains the source of truth.

## Grafana Admin Secret

The observability HelmRelease expects:

```text
Secret: grafana-admin
Namespace: monitoring
Keys: admin-user, admin-password
```

Create it as SOPS:

```bash
cp kubernetes/secrets/grafana-admin.example.yml /tmp/grafana-admin.yml
sops --encrypt /tmp/grafana-admin.yml > kubernetes/secrets/grafana-admin.sops.yml
rm /tmp/grafana-admin.yml
```

Or bootstrap it once with Ansible or kubectl before installing observability:

```bash
kubectl create namespace monitoring
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='<strong-password>'
```

The SOPS version should still be committed afterward for repeatability.

## Cloudflare Secrets

Cert-manager DNS-01 token:

```bash
cp kubernetes/secrets/cloudflare-api-token.example.yml /tmp/cloudflare-api-token.yml
sops --encrypt /tmp/cloudflare-api-token.yml > kubernetes/secrets/cloudflare-api-token.sops.yml
rm /tmp/cloudflare-api-token.yml
```

Cloudflare Tunnel token:

```bash
cp kubernetes/secrets/cloudflared-token.example.yml /tmp/cloudflared-token.yml
sops --encrypt /tmp/cloudflared-token.yml > kubernetes/secrets/cloudflared-token.sops.yml
rm /tmp/cloudflared-token.yml
```

Add both encrypted files to `kubernetes/secrets/kustomization.yml`.

## Recovery

Back up these outside the repo:

```text
~/.config/sops/age/keys.txt
Flux deploy key private key or the ability to create a replacement deploy key
```

If the age private key is lost, existing `.sops.yml` files cannot be decrypted.
If the Flux deploy key is lost, create a new deploy key, update the repository
deploy key, and replace the `flux-system` secret.
