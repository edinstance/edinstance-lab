# Homelab Kubernetes Deployment Runbook

This repository builds a kubeadm-based Kubernetes control plane with:

- Ansible for Ubuntu host preparation.
- kube-vip for the Kubernetes API virtual IP.
- Cilium for pod networking.
- MetalLB for LAN `LoadBalancer` addresses.
- Envoy Gateway for HTTP ingress using Gateway API.

Do not deploy from this document blindly. Read each checkpoint before continuing.

## Current Files

```text
ansible/inventory.ini
ansible/group_vars/all.yml
ansible/playbooks/00-os-prereqs.yml
ansible/playbooks/01-containerd.yml
ansible/playbooks/02-kubernetes-packages.yml
ansible/playbooks/03-kube-vip.yml
ansible/playbooks/90-backup-control-plane.yml
config/network.yml
kubernetes/bootstrap/kubeadm-config.yml
kubernetes/addons/cilium/values.yml
kubernetes/addons/metrics-server/values.yml
kubernetes/addons/metallb/values.yml
kubernetes/addons/metallb/ip-address-pool.yml
kubernetes/addons/longhorn/values.yml
kubernetes/addons/envoy-gateway/values.yml
kubernetes/addons/envoy-gateway/gatewayclass.yml
kubernetes/addons/envoy-gateway/gateway.yml
kubernetes/addons/cloudflare-tunnel/namespace.yml
kubernetes/addons/cloudflare-tunnel/secret.example.yml
kubernetes/addons/cloudflare-tunnel/deployment.yml
kubernetes/addons/cert-manager/values.yml
kubernetes/addons/cert-manager/issuers.yml
kubernetes/addons/cert-manager/wildcard-certificate.yml
kubernetes/secrets/cloudflare-api-token.example.yml
apps/whoami/whoami.yml
dns.md
cloudflare-tunnel.md
secrets.md
tls.md
gitops.md
helmfile.yaml
```

The repo uses `.yml` file names. Use these exact paths unless the files are renamed.

## Local Tools

Install these on the admin machine:

```bash
brew install ansible kubectl helm yq jq
```

Optional later:

```bash
brew install helmfile
```

Pinned versions currently used by this repo:

```text
Kubernetes packages: 1.30.14-1.1
Kubernetes cluster version: v1.30.14
kube-vip: v0.8.2
Cilium chart: 1.19.4
metrics-server chart: 3.13.0
MetalLB chart: 0.16.1
Envoy Gateway chart: v1.8.0
Longhorn chart: 1.11.2
cert-manager chart: v1.20.2
```

## Fresh Environment

### Destructive Rebuild Rehearsal

Before important stateful workloads exist, you can run one full destructive
rebuild rehearsal to prove the repo can recreate the cluster from the nodes.
This removes kubeadm, CNI, etcd, kubelet, and Longhorn state from the nodes.

```bash
scripts/destructive-rebuild-rehearsal.sh --yes
```

To include Flux controller installation and the initial in-cluster secrets:

```bash
FLUX_GIT_IDENTITY_FILE=~/.ssh/edinstance-lab-flux \
SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt \
GRAFANA_ADMIN_PASSWORD='<password>' \
scripts/destructive-rebuild-rehearsal.sh --yes --with-flux
```

Use this only while the cluster has no important persistent data, or after
backup and restore procedures have been proven.

If the admin machine cannot reach the nodes on their LAN IPs but can reach them
over Tailscale, create a local copy of
`ansible/inventory.tailscale.example.ini` and set each `ansible_host` to the
node's Tailscale IP or MagicDNS name. Keep Kubernetes LAN values as
`192.168.2.10`, `192.168.2.11`, `192.168.2.12`, and keep the API VIP on
`192.168.2.80`.

Before rebuilding through Tailscale, SSH to each node and confirm the nodes can
reach each other on the LAN:

```bash
ip -4 addr
ip route
ping -c 3 192.168.2.10
ping -c 3 192.168.2.11
ping -c 3 192.168.2.12
```

If the nodes cannot reach each other on `192.168.2.x`, fix the LAN/VLAN/DHCP
configuration before bootstrapping Kubernetes.

### 1. Prepare Node Access

Set node hostnames on the Ubuntu machines:

```bash
sudo hostnamectl set-hostname k8s-1
sudo hostnamectl set-hostname k8s-2
sudo hostnamectl set-hostname k8s-3
```

Enable SSH on each node:

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
```

Copy your admin SSH key to each node:

```bash
ssh-copy-id <user>@<node-ip>
```

Update `ansible/inventory.ini` so every node that should be configured is present and uncommented.

This cluster is modeled as three control-plane nodes that are also schedulable for normal workloads:

```text
k8s-1: control-plane + worker
k8s-2: control-plane + worker
k8s-3: control-plane + worker
```

Check Ansible access:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m ping
```

### 2. Prepare Ubuntu Hosts

Run the host preparation playbooks:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/00-os-prereqs.yml
ansible-playbook -i ansible/inventory.ini ansible/playbooks/01-containerd.yml
ansible-playbook -i ansible/inventory.ini ansible/playbooks/02-kubernetes-packages.yml
```

Reboot and verify access:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m reboot --become
ansible -i ansible/inventory.ini k8s_nodes -m ping
```

### 3. Install kube-vip on Control-Plane Nodes

Create the kube-vip static pod manifest before `kubeadm init` on the first control-plane node and before `kubeadm join --control-plane` on any additional control-plane node:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/03-kube-vip.yml --limit <node-name>
```

### 4. Bootstrap Kubernetes

Copy the kubeadm config to the first control-plane node:

```bash
scp kubernetes/bootstrap/kubeadm-config.yml <user>@<first-node-ip>:/tmp/kubeadm-config.yml
```

Run on the first control-plane node:

```bash
sudo kubeadm init --config /tmp/kubeadm-config.yml --upload-certs
```

Save the printed control-plane join command and certificate key.

Configure kubeconfig on the first node:

```bash
mkdir -p ~/.kube
sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown "$(id -u):$(id -g)" ~/.kube/config
```

Copy kubeconfig back to the admin machine:

```bash
mkdir -p ~/.kube
scp <user>@<first-node-ip>:~/.kube/config ~/.kube/homelab
export KUBECONFIG=~/.kube/homelab
kubectl get nodes
```

The first node will be `NotReady` until Cilium is installed.

### 5. Install Cilium

```bash
helm repo add cilium https://helm.cilium.io
helm repo update
helm upgrade --install cilium cilium/cilium \
  --namespace kube-system \
  --version 1.19.4 \
  --values kubernetes/addons/cilium/values.yml
```

Check:

```bash
kubectl -n kube-system rollout status ds/cilium
kubectl get nodes
```

After all three control-plane nodes have joined, allow normal workloads to schedule on them:

```bash
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

### 6. Join Additional Control-Plane Nodes

Before running the `kubeadm join` command on each additional control-plane node, install the same kube-vip static pod manifest on that node.

Then run the saved control-plane join command:

```bash
sudo kubeadm join <k8s-api-vip>:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash> \
  --control-plane \
  --certificate-key <certificate-key>
```

If the token or certificate key expired, generate new values on an existing control-plane node:

```bash
sudo kubeadm token create --print-join-command
sudo kubeadm init phase upload-certs --upload-certs
```

### 7. Install Cluster Addons

Install metrics-server:

```bash
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo update
helm upgrade --install metrics-server metrics-server/metrics-server \
  --namespace kube-system \
  --version 3.13.0 \
  --values kubernetes/addons/metrics-server/values.yml
```

Install MetalLB:

```bash
helm repo add metallb https://metallb.github.io/metallb
helm repo update
helm upgrade --install metallb metallb/metallb \
  --namespace metallb-system \
  --create-namespace \
  --version 0.16.1 \
  --values kubernetes/addons/metallb/values.yml
```

Apply the MetalLB address pool:

```bash
kubectl apply -f kubernetes/addons/metallb/ip-address-pool.yml
```

Install Envoy Gateway:

```bash
helm upgrade --install envoy-gateway oci://docker.io/envoyproxy/gateway-helm \
  --namespace envoy-gateway-system \
  --create-namespace \
  --version v1.8.0 \
  --values kubernetes/addons/envoy-gateway/values.yml
```

Alternatively, install or update all Helm-managed addons from the pinned `helmfile.yaml`:

```bash
helmfile sync
```

Apply Gateway API resources:

```bash
kubectl apply -f kubernetes/addons/envoy-gateway/gatewayclass.yml
kubectl apply -f kubernetes/addons/envoy-gateway/gateway.yml
```

### 8. Deploy the Smoke Test

Create the app namespace and deploy `whoami`:

```bash
kubectl create namespace apps
kubectl apply -f apps/whoami/whoami.yml
```

Create DNS for the app hostname pointing at the Envoy Gateway IP, then test:

```bash
curl http://whoami.local.edinstance.com
```

## Health Checks

Run these after bootstrap and after major changes:

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl get svc -A
kubectl get gatewayclass
kubectl get gateway -A
kubectl get httproute -A
kubectl -n metallb-system get ipaddresspool,l2advertisement
kubectl top nodes
```

Expected state:

```text
All nodes Ready
Cilium Running
CoreDNS Running
MetalLB controller and speakers Running
Envoy Gateway Running
Gateway Accepted and Programmed
HTTPRoute Accepted
```

## Backups

See `backup.md` for the detailed explanation of what is captured and how the backup works.

Control-plane backups contain cluster credentials and must not be committed. They are written under the git-ignored `backups/` directory.

Run after bootstrap, before upgrades, and after major control-plane changes:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/90-backup-control-plane.yml
```

The playbook fetches a timestamped archive from each control-plane node with:

```text
/etc/kubernetes/pki
/etc/kubernetes/admin.conf
/etc/kubernetes/manifests
/var/lib/kubelet/config.yaml
```

It also attempts an etcd snapshot from the first control-plane node when `etcdctl` and the kubeadm etcd certificates are present.

Backups are stored locally like this:

```text
backups/YYYYMMDDTHHMMSSZ/
```

These backups cover kubeadm control-plane recovery material. They do not back up application persistent volumes. Add storage-specific backups after choosing the storage backend.

## DNS

See `dns.md` for the service DNS model.

Services should generally support:

```text
service.local.edinstance.com
service.lab.edinstance.com
```

Local `*.local.edinstance.com` records should point at the Envoy Gateway ingress IP:

```text
192.168.2.100
```

Public `*.lab.edinstance.com` records should be configured as Cloudflare Tunnel
routes that target internal Kubernetes services directly.

## Cloudflare Tunnel

See `cloudflare-tunnel.md` for the public ingress model.

Use Cloudflare Tunnel for selected public `*.lab.edinstance.com` services. Keep
MetalLB and Envoy Gateway for `*.local.edinstance.com` LAN access.

Do not commit the real tunnel token. Create it directly in Kubernetes:

```bash
kubectl create namespace cloudflare-tunnel
kubectl -n cloudflare-tunnel create secret generic cloudflared-token \
  --from-literal=token='<cloudflare-tunnel-token>'
```

Then deploy the connector when ready:

```bash
kubectl apply -f kubernetes/addons/cloudflare-tunnel/namespace.yml
kubectl apply -f kubernetes/addons/cloudflare-tunnel/deployment.yml
```

## Add a New Control-Plane Node

1. Add the node to `config/network.yml`.
2. Add the node to `ansible/inventory.ini`.
3. Add the node IP and hostname to `kubernetes/bootstrap/kubeadm-config.yml` certificate SANs before bootstrapping a fresh cluster. For an already-running cluster, check whether the API server certificate needs renewal before relying on the new SAN.
4. Run the three Ansible playbooks against the new node.
5. Install the kube-vip static pod manifest on the new node.
6. Generate a fresh control-plane join command if needed:

```bash
sudo kubeadm token create --print-join-command
sudo kubeadm init phase upload-certs --upload-certs
```

7. Run `kubeadm join` with `--control-plane` and `--certificate-key`.
8. Verify:

```bash
kubectl get nodes -o wide
kubectl -n kube-system get pods -o wide
```

## Add a Dedicated Worker Node

Only use this flow when adding a node that should not be part of the control plane.

1. Add the node to `config/network.yml`.
2. Add a worker inventory group, for example:

```ini
[k8s_workers]
k8s-4 ansible_host=<node-ip>

[k8s_nodes:children]
k8s_control_plane
k8s_workers
```

3. Run the three Ansible playbooks against the new node.
4. Generate a worker join command on a control-plane node:

```bash
sudo kubeadm token create --print-join-command
```

5. Run the join command on the worker.
6. Verify:

```bash
kubectl get nodes -o wide
```

## Update Kubernetes Nodes

Upgrade one minor version at a time. Read the Kubernetes release notes before starting.

On the first control-plane node:

```bash
sudo apt-mark unhold kubeadm
sudo apt update
sudo apt install -y kubeadm=<target-version>
sudo apt-mark hold kubeadm
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v<target-version>
```

Then drain and update kubelet/kubectl:

```bash
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
sudo apt-mark unhold kubelet kubectl
sudo apt install -y kubelet=<target-version> kubectl=<target-version>
sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload
sudo systemctl restart kubelet
kubectl uncordon <node>
```

For additional control-plane nodes:

```bash
sudo apt-mark unhold kubeadm
sudo apt update
sudo apt install -y kubeadm=<target-version>
sudo apt-mark hold kubeadm
sudo kubeadm upgrade node
```

Then drain, update kubelet/kubectl, restart kubelet, and uncordon.

For workers, run `kubeadm upgrade node`, then update kubelet/kubectl in the same drain and uncordon pattern.

## Update Addons

Check current releases:

```bash
helm list -A
```

Update one addon at a time:

```bash
helm repo update
helm upgrade --install <release> <repo/chart> \
  --namespace <namespace> \
  --values <values-file>
```

Recommended order:

1. Cilium.
2. metrics-server.
3. MetalLB.
4. Envoy Gateway.
5. Longhorn.
6. cert-manager.

Run health checks after each addon.

## Storage

See `storage.md` for the storage decision and Longhorn operating notes.

Longhorn is the selected default storage backend. Install it only after the cluster is healthy and all three nodes are `Ready`:

```bash
helm repo add longhorn https://charts.longhorn.io
helm repo update
helm upgrade --install longhorn longhorn/longhorn \
  --namespace longhorn-system \
  --create-namespace \
  --version 1.11.2 \
  --values kubernetes/addons/longhorn/values.yml
```

Or with Helmfile:

```bash
helmfile sync --selector name=longhorn
```

Verify:

```bash
kubectl -n longhorn-system get pods
kubectl get storageclass
```

## Secrets

See `secrets.md`.

Use SOPS with age for secrets stored in git. Before adding real secrets, replace the placeholder in `.sops.yaml` with your age public key.

Do not commit plaintext Cloudflare tokens, Longhorn backup credentials, or application secrets.

## TLS

See `tls.md`.

Use cert-manager with Cloudflare DNS-01 validation for `edinstance.com`.

Install cert-manager when ready:

```bash
helmfile sync --selector name=cert-manager
```

Then apply the encrypted Cloudflare API token, ClusterIssuers, and wildcard certificate in that order.

## GitOps

See `gitops.md`.

Flux is the planned GitOps controller once the base cluster, secrets, and TLS are stable.

## Helm Guidance

Use Helm now for third-party addons because those projects already publish maintained charts.

Do not create custom Helm charts yet for this repo. The current app and platform resources are small, readable YAML files, and adding a chart layer would mostly add indirection. Revisit custom charts when you have repeated apps that share the same Deployment, Service, HTTPRoute, config, and secret patterns.

`helmfile.yaml` records addon chart versions. Use it once you want one command to converge the Helm-managed addons.

## Gaps To Close

- Replace `.sops.yaml` placeholder with the real age public key.
- Create and encrypt the real Cloudflare API token secret.
- Add HTTPS listeners to Envoy Gateway after the wildcard certificate is issued.
- Configure a Longhorn backup target before important stateful workloads.
- Add a storage plan before stateful workloads, for example local-path-provisioner, Longhorn, Rook/Ceph, or external NAS-backed storage.
- Add DNS automation later if manual DNS records become annoying.
- Add a secrets approach before real apps, for example SOPS with age, External Secrets, or sealed-secrets.
- Add a GitOps controller later if this becomes more than a small manually managed cluster.
