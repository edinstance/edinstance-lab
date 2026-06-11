# Homelab Kubernetes Runbook

This repo is the source of truth for the `edinstance-lab` homelab cluster.
It builds a three-node kubeadm Kubernetes cluster, bootstraps the core Helm
add-ons, then lets Flux reconcile the ongoing cluster state from `main`.

Current git remote:

```bash
git remote -v
# origin  https://github.com/edinstance/edinstance-lab.git
```

Current Flux source:

```text
ssh://git@github.com/edinstance/edinstance-lab.git
branch: main
path: ./kubernetes/gitops/sync
```

## Current Shape

Nodes are defined in `ansible/inventory.ini`:

```text
k8s-1  192.168.2.10
k8s-2  192.168.2.11
k8s-3  192.168.2.12
```

All three nodes are both control-plane and worker nodes. Cluster values live in
`ansible/group_vars/all.yml`:

```text
Kubernetes: 1.36.1
kube-vip: v0.8.2
API VIP: 192.168.2.80
Pod CIDR: 10.244.0.0/16
Service CIDR: 10.96.0.0/12
MetalLB pool: 192.168.2.100-192.168.2.149
Envoy ingress IP: 192.168.2.100
```

Core components:

```text
kubeadm       cluster bootstrap
kube-vip      Kubernetes API VIP
Cilium        CNI, installed before nodes become Ready
metrics-server, MetalLB, Envoy Gateway, Longhorn, cert-manager
Flux          GitOps reconciliation from this repository
SOPS/age      encrypted Kubernetes secrets
```

Flux reconciles these paths:

```text
kubernetes/secrets            encrypted SOPS secrets and namespaces
kubernetes/addons             Cloudflare tunnel, Envoy Gateway resources, observability, OpenTelemetry
kubernetes/addons/cert-manager certificate issuers and wildcard certificate
kubernetes/platform/crds      platform.edinstance.uk API CRDs
apps                          app workloads; currently empty except the template
```

Some controllers are bootstrapped outside Flux first because the cluster needs
them before GitOps can converge. `helmfile.yaml` manages the initial Helm
install of Cilium, metrics-server, MetalLB, Envoy Gateway, Longhorn, and
cert-manager.

## Local Setup

Install local tools on the admin machine:

```bash
brew install ansible kubectl helm helmfile jq yq sops age fluxcd/tap/flux rg
```

Clone and enter the repo:

```bash
git clone https://github.com/edinstance/edinstance-lab.git
cd edinstance-lab
git checkout main
git pull --ff-only origin main
```

Set the kubeconfig used by this runbook:

```bash
export KUBECONFIG="$HOME/.kube/homelab"
```

Check node access before doing any cluster work:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m ping
```

If sudo requires a password, add:

```bash
export ASK_BECOME_PASS=1
```

## Secrets Setup

Secrets are committed only as SOPS-encrypted manifests under
`kubernetes/secrets/*.sops.yml`. Do not commit plaintext Kubernetes Secret
manifests.

Create an age key if this admin machine does not already have one:

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
grep '^# public key:' ~/.config/sops/age/keys.txt
```

Make sure `.sops.yaml` contains the matching public recipient.

Flux needs these two in-cluster secrets during bootstrap:

```text
flux-system/flux-system  SSH deploy key for GitHub
flux-system/sops-age     age private key for decrypting SOPS manifests
```

The bootstrap playbook creates both when these variables are set:

```bash
export FLUX_GIT_IDENTITY_FILE="$HOME/.ssh/edinstance-lab-flux"
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
```

The public key must exist at `$FLUX_GIT_IDENTITY_FILE.pub` and must be added to
the GitHub repo as a deploy key.

Edit an encrypted secret:

```bash
sops kubernetes/secrets/grafana-admin.sops.yml
```

Create a new encrypted secret from an example:

```bash
cp kubernetes/secrets/cloudflared-token.example.yml /tmp/cloudflared-token.yml
$EDITOR /tmp/cloudflared-token.yml
sops --encrypt /tmp/cloudflared-token.yml > kubernetes/secrets/cloudflared-token.sops.yml
rm /tmp/cloudflared-token.yml
```

Then add it to `kubernetes/secrets/kustomization.yml` if it is not already
listed.

## Initial Cluster Setup

Run non-destructive preflight checks first:

```bash
scripts/preflight-rebuild-check.sh --with-flux
```

Prepare Ubuntu hosts without resetting any Kubernetes state:

```bash
scripts/prepare-nodes.sh --reboot
```

For a fresh or disposable cluster, the supported end-to-end path is the
destructive rehearsal script. It removes kubeadm, CNI, etcd, kubelet,
containerd, and Longhorn state from the nodes.

```bash
export KUBECONFIG="$HOME/.kube/homelab"
export FLUX_GIT_IDENTITY_FILE="$HOME/.ssh/edinstance-lab-flux"
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"

scripts/destructive-rebuild-rehearsal.sh --yes --with-flux
```

Use that only before important persistent workloads exist, or after backup and
restore procedures have been proven.

Manual bootstrap, if the script is not appropriate:

```bash
scripts/prepare-nodes.sh --reboot

ansible-playbook -i ansible/inventory.ini ansible/playbooks/03-kube-vip-bootstrap.yml \
  --limit k8s-1 \
  -e first_control_plane=k8s-1

ansible -i ansible/inventory.ini k8s-1 --become -m copy \
  -a "src=$PWD/kubernetes/bootstrap/kubeadm-config.yml dest=/tmp/kubeadm-config.yml mode=0644"

ansible -i ansible/inventory.ini k8s-1 --become -m command \
  -a "kubeadm init --config /tmp/kubeadm-config.yml --upload-certs --skip-phases=addon/kube-proxy"
```

Fetch kubeconfig and install Cilium:

```bash
mkdir -p ~/.kube .tmp
ansible -i ansible/inventory.ini k8s-1 --become -m fetch \
  -a "src=/etc/kubernetes/admin.conf dest=$PWD/.tmp/admin.conf flat=true"
install -m 0600 .tmp/admin.conf "$HOME/.kube/homelab"
export KUBECONFIG="$HOME/.kube/homelab"

helm repo add cilium https://helm.cilium.io
helm repo update
helm upgrade --install cilium cilium/cilium \
  --namespace kube-system \
  --version 1.19.4 \
  --values kubernetes/addons/cilium/values.yml
```

Join the other control-plane nodes using the `kubeadm join --control-plane`
command printed by `kubeadm init`, then install the normal kube-vip manifest on
each joined control-plane:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/03-kube-vip.yml --limit k8s-2
ansible-playbook -i ansible/inventory.ini ansible/playbooks/03-kube-vip.yml --limit k8s-3
```

Install core Helm add-ons and static add-on resources:

```bash
helmfile sync
kubectl apply -k kubernetes/addons/metallb
kubectl apply -k kubernetes/addons/envoy-gateway
kubectl taint nodes --all node-role.kubernetes.io/control-plane- || true
```

Bootstrap Flux:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/04-flux-bootstrap.yml
flux check
flux get sources git -A
flux get kustomizations -A
```

## Normal GitOps Workflow

Make a change:

```bash
git checkout main
git pull --ff-only origin main
$EDITOR kubernetes/addons/... apps/... kubernetes/secrets/...
kubectl kustomize kubernetes/gitops/sync >/dev/null
git diff
git add <files>
git commit -m "..."
git push origin main
```

Flux polls `main`, but during an incident you normally force reconciliation
instead of waiting.

Reconcile the Git source first:

```bash
flux reconcile source git edinstance-lab -n flux-system
```

Then reconcile the specific Kustomization:

```bash
flux reconcile kustomization secrets -n flux-system --with-source
flux reconcile kustomization addons -n flux-system --with-source
flux reconcile kustomization certificates -n flux-system --with-source
flux reconcile kustomization platform -n flux-system --with-source
flux reconcile kustomization apps -n flux-system --with-source
```

If a reconcile command appears to hang, run it with an explicit timeout in a
second terminal so it fails clearly:

```bash
flux reconcile kustomization addons -n flux-system --with-source --timeout=2m
```

Then jump to the Flux triage section below. A hanging reconcile usually means
Flux is waiting for health checks, a HelmRelease, a stuck apply, or source fetch
rather than the CLI itself being the root problem.

Use `kubectl apply` directly only for bootstrap, emergency diagnosis, or an
explicit temporary hotfix. Commit the same change afterward or Flux may revert
it.

Useful direct applies:

```bash
kubectl apply -k kubernetes/addons/flux
kubectl apply -k kubernetes/secrets
kubectl apply -k kubernetes/addons/metallb
kubectl apply -k kubernetes/addons/envoy-gateway
kubectl apply -k apps
```

## Health Checks

Start broad:

```bash
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl get events -A --sort-by=.lastTimestamp | tail -80
flux check
flux get sources git -A
flux get kustomizations -A
flux get helmreleases -A
```

Check core namespaces:

```bash
kubectl -n kube-system get pods -o wide
kubectl -n flux-system get pods -o wide
kubectl -n metallb-system get pods -o wide
kubectl -n gateway-system get pods -o wide
kubectl -n cert-manager get pods -o wide
kubectl -n monitoring get pods -o wide
kubectl -n opentelemetry get pods -o wide
kubectl -n cloudflare-tunnel get pods -o wide
```

Check rollouts:

```bash
kubectl -n kube-system rollout status ds/cilium
kubectl -n kube-system rollout status deployment/metrics-server
kubectl -n metallb-system rollout status deployment/metallb-controller
kubectl -n metallb-system rollout status daemonset/metallb-speaker
kubectl -n gateway-system rollout status deployment/envoy-gateway
kubectl -n cert-manager rollout status deployment/cert-manager
kubectl -n cert-manager rollout status deployment/cert-manager-webhook
kubectl -n cert-manager rollout status deployment/cert-manager-cainjector
```

Check ingress and certificates:

```bash
kubectl get gatewayclass
kubectl get gateway -A
kubectl get httproute -A
kubectl get certificate,certificaterequest,order,challenge -A
kubectl -n gateway-system describe gateway main-gateway
```

Check Helm-managed resources:

```bash
helm list -A
helmfile status
flux get helmreleases -A
```

## Pod And Container Triage

When something is broken, inspect each failing pod and each container inside
that pod. Many pods have init containers or sidecars, and the default logs only
show one container.

Find failing pods:

```bash
kubectl get pods -A \
  --field-selector=status.phase!=Running,status.phase!=Succeeded \
  -o wide
```

Describe the pod:

```bash
kubectl -n <namespace> describe pod <pod>
```

List containers and init containers:

```bash
kubectl -n <namespace> get pod <pod> \
  -o jsonpath='{range .spec.initContainers[*]}init: {.name}{"\n"}{end}{range .spec.containers[*]}container: {.name}{"\n"}{end}'
```

Check current logs for every container:

```bash
for c in $(kubectl -n <namespace> get pod <pod> -o jsonpath='{.spec.containers[*].name}'); do
  echo "### $c"
  kubectl -n <namespace> logs <pod> -c "$c" --tail=200
done
```

Check previous crash logs:

```bash
for c in $(kubectl -n <namespace> get pod <pod> -o jsonpath='{.spec.containers[*].name}'); do
  echo "### previous $c"
  kubectl -n <namespace> logs <pod> -c "$c" --previous --tail=200 || true
done
```

Check init container logs:

```bash
for c in $(kubectl -n <namespace> get pod <pod> -o jsonpath='{.spec.initContainers[*].name}'); do
  echo "### init $c"
  kubectl -n <namespace> logs <pod> -c "$c" --tail=200 || true
done
```

Check why scheduling failed:

```bash
kubectl -n <namespace> get pod <pod> -o yaml | yq '.status.conditions'
kubectl describe node <node>
kubectl top nodes
kubectl top pods -A
```

## Flux Triage

Check whether Flux can pull the repo:

```bash
flux get sources git -A
kubectl -n flux-system describe gitrepository edinstance-lab
kubectl -n flux-system logs deploy/source-controller --tail=200
```

Check Kustomization failures:

```bash
flux get kustomizations -A
kubectl -n flux-system describe kustomization <name>
kubectl -n flux-system logs deploy/kustomize-controller --tail=300
```

Check HelmRelease failures:

```bash
flux get helmreleases -A
kubectl -n flux-system describe helmrelease <name>
kubectl -n flux-system logs deploy/helm-controller --tail=300
```

Common reconcile order:

```bash
flux reconcile source git edinstance-lab -n flux-system
flux reconcile kustomization secrets -n flux-system --with-source
flux reconcile kustomization addons -n flux-system --with-source
flux reconcile kustomization certificates -n flux-system --with-source
flux reconcile kustomization platform -n flux-system --with-source
flux reconcile kustomization apps -n flux-system --with-source
```

If `flux reconcile kustomization addons -n flux-system --with-source` hangs:

1. Set a timeout so the command returns:

```bash
flux reconcile kustomization addons -n flux-system --with-source --timeout=2m
```

2. Check the Kustomization condition and events:

```bash
flux get kustomization addons -n flux-system
kubectl -n flux-system describe kustomization addons
kubectl get events -A --sort-by=.lastTimestamp | tail -120
```

3. Check whether the source is stale or blocked:

```bash
flux get source git edinstance-lab -n flux-system
kubectl -n flux-system describe gitrepository edinstance-lab
kubectl -n flux-system logs deploy/source-controller --tail=200
```

4. Check what the kustomize controller is waiting on:

```bash
kubectl -n flux-system logs deploy/kustomize-controller --tail=300
kubectl -n flux-system logs deploy/kustomize-controller --since=10m | rg 'addons|error|failed|waiting|timeout'
```

5. Because `addons` has `wait: true`, inspect the resources it manages:

```bash
kubectl -n cloudflare-tunnel get pods -o wide
kubectl -n gateway-system get gateway,pods -o wide
kubectl -n monitoring get pods -o wide
kubectl -n opentelemetry get pods -o wide
flux get helmreleases -A
```

6. Describe any non-ready pod, HelmRelease, Gateway, or Certificate:

```bash
kubectl -n <namespace> describe pod <pod>
kubectl -n flux-system describe helmrelease <helmrelease>
kubectl -n gateway-system describe gateway main-gateway
kubectl get certificate,certificaterequest,order,challenge -A
```

7. If the reconcile is blocked by a bad commit, revert or fix it in git, push
to `main`, then reconcile source and `addons` again:

```bash
git revert <bad-commit>
git push origin main
flux reconcile source git edinstance-lab -n flux-system
flux reconcile kustomization addons -n flux-system --with-source --timeout=5m
```

Temporarily stop Flux from changing a resource while investigating:

```bash
flux suspend kustomization apps -n flux-system
flux resume kustomization apps -n flux-system
```

Do not leave Flux suspended after the incident.

## Incident Git Workflow

Before changing anything:

```bash
git status --short
git fetch origin
git log --oneline --decorate -5
git diff
```

If the worktree has unrelated changes, do not overwrite them. Either commit
your incident fix on top or create a branch:

```bash
git switch -c incident/<short-name>
```

For a normal fix:

```bash
$EDITOR <file>
kubectl kustomize kubernetes/gitops/sync >/dev/null
git diff
git add <file>
git commit -m "fix: <short incident summary>"
git push origin HEAD
```

If Flux tracks only `main`, merge or fast-forward the fix to `main` and push:

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only incident/<short-name>
git push origin main
flux reconcile source git edinstance-lab -n flux-system
```

If you applied an emergency hotfix directly with `kubectl`, capture it back
into git immediately:

```bash
kubectl -n <namespace> get <kind> <name> -o yaml > /tmp/live.yml
git diff
```

Then port the relevant change into the repo manifest, commit, push, and
reconcile Flux. Do not commit generated live object metadata such as
`resourceVersion`, `uid`, `managedFields`, or status.

## Node And Control-Plane Checks

Check kubelet and container runtime on a node:

```bash
ssh edward@192.168.2.10
sudo systemctl status kubelet
sudo journalctl -u kubelet -n 200 --no-pager
sudo systemctl status containerd
sudo journalctl -u containerd -n 200 --no-pager
```

Check static control-plane pods:

```bash
kubectl -n kube-system get pods -l tier=control-plane -o wide
kubectl -n kube-system logs <control-plane-pod> --tail=200
```

Check API VIP from the admin machine:

```bash
curl -k https://192.168.2.80:6443/readyz
kubectl cluster-info
```

Back up control-plane state with the existing playbook:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/90-backup-control-plane.yml
```

## Network Checks

Check Cilium:

```bash
kubectl -n kube-system get pods -l k8s-app=cilium -o wide
kubectl -n kube-system describe ds cilium
kubectl -n kube-system logs ds/cilium --tail=200
```

Check MetalLB:

```bash
kubectl -n metallb-system get pods -o wide
kubectl -n metallb-system logs deploy/metallb-controller --tail=200
kubectl -n metallb-system logs ds/metallb-speaker --tail=200
kubectl -n metallb-system get ipaddresspool,l2advertisement
```

Check Envoy Gateway:

```bash
kubectl -n gateway-system get gateway main-gateway -o wide
kubectl -n gateway-system describe gateway main-gateway
kubectl -n gateway-system logs deploy/envoy-gateway --tail=200
kubectl get svc -A | grep 192.168.2.100
```

Check Cloudflare tunnel:

```bash
kubectl -n cloudflare-tunnel get pods -o wide
kubectl -n cloudflare-tunnel describe pod <pod>
kubectl -n cloudflare-tunnel logs deploy/cloudflared --tail=200
```

## Repository Map

```text
ansible/                         host preparation, kube-vip, Flux bootstrap, backups
config/network.yml               network reference values
helmfile.yaml                    initial Helm-managed add-ons
kubernetes/bootstrap/            kubeadm config
kubernetes/addons/               add-on resources reconciled by Flux or applied during bootstrap
kubernetes/addons/flux/          GitRepository and root Kustomization
kubernetes/gitops/sync/          Flux Kustomizations
kubernetes/secrets/              SOPS-encrypted Kubernetes secrets
kubernetes/platform/             platform CRDs and sample App contract
apps/                            application workloads; currently empty, template under apps/_template
services/platform-api/           Go API service source
services/frontend/               frontend source
scripts/                         preflight, node prep, destructive rebuild rehearsal
```
