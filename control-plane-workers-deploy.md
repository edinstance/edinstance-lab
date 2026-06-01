# All Control-Plane And Worker Node Deploy Plan

This plan assumes every node is both a Kubernetes control-plane node and a
worker node:

```text
k8s-1  192.168.2.10
k8s-2  192.168.2.11
k8s-3  192.168.2.12
API VIP 192.168.2.80
```

The inventory already matches this model because `k8s-1`, `k8s-2`, and `k8s-3`
are listed in both `k8s_control_plane` and `k8s_workers`.

## 1. Prepare All Nodes

Run these from the admin machine:

```bash
ansible -i ansible/inventory.ini k8s_nodes -m ping

ansible-playbook -i ansible/inventory.ini ansible/playbooks/00-os-prereqs.yml
ansible-playbook -i ansible/inventory.ini ansible/playbooks/01-containerd.yml
ansible-playbook -i ansible/inventory.ini ansible/playbooks/02-kubernetes-packages.yml

ansible -i ansible/inventory.ini k8s_nodes -m reboot --become
ansible -i ansible/inventory.ini k8s_nodes -m ping
```

## 2. Bootstrap The First Control Plane

Install kube-vip on the first node before running `kubeadm init`:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/03-kube-vip.yml --limit k8s-1
```

Copy the kubeadm config to `k8s-1`:

```bash
scp kubernetes/bootstrap/kubeadm-config.yml edward@192.168.2.10:/tmp/kubeadm-config.yml
```

Run on `k8s-1`:

```bash
sudo kubeadm init --config /tmp/kubeadm-config.yml --upload-certs
```

Save the printed `kubeadm join ... --control-plane ... --certificate-key ...`
command. It is needed when joining `k8s-2` and `k8s-3`.

Create a kubeconfig on `k8s-1`:

```bash
mkdir -p ~/.kube
sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown "$(id -u):$(id -g)" ~/.kube/config
```

Copy the kubeconfig back to the admin machine:

```bash
mkdir -p ~/.kube
scp edward@192.168.2.10:~/.kube/config ~/.kube/homelab
export KUBECONFIG=~/.kube/homelab
kubectl get nodes
```

At this point, the first node may show `NotReady` until Cilium is installed.

## 3. Install Cilium

Run from the admin machine:

```bash
export KUBECONFIG=~/.kube/homelab

helm repo add cilium https://helm.cilium.io
helm repo update
helm upgrade --install cilium cilium/cilium \
  --namespace kube-system \
  --version 1.19.4 \
  --values kubernetes/addons/cilium/values.yml
```

Check the rollout:

```bash
kubectl -n kube-system rollout status ds/cilium
kubectl get nodes
```

`k8s-1` should become `Ready`.

## 4. Join k8s-2 And k8s-3 As Control Planes

Before joining each additional control-plane node, install kube-vip on that
node.

For `k8s-2`:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/03-kube-vip.yml --limit k8s-2
ssh edward@192.168.2.11
sudo kubeadm join 192.168.2.80:6443 ... --control-plane --certificate-key ...
```

For `k8s-3`:

```bash
ansible-playbook -i ansible/inventory.ini ansible/playbooks/03-kube-vip.yml --limit k8s-3
ssh edward@192.168.2.12
sudo kubeadm join 192.168.2.80:6443 ... --control-plane --certificate-key ...
```

Use the real join command printed by `kubeadm init`. If the token or certificate
key has expired, generate fresh values on an existing control-plane node:

```bash
sudo kubeadm token create --print-join-command
sudo kubeadm init phase upload-certs --upload-certs
```

Then check all nodes:

```bash
kubectl get nodes -o wide
```

## 5. Make Control Planes Schedulable

Because these nodes are also workers, remove the default control-plane taint:

```bash
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

If Kubernetes reports that the taint was not found, that is fine.

Verify:

```bash
kubectl describe nodes | rg -n "Name:|Taints:"
```

Each node should show either no taints or only taints that were intentionally
added.

## 6. Install Cluster Addons

Run from the admin machine:

```bash
helmfile sync

kubectl apply -f kubernetes/addons/metallb/ip-address-pool.yml
kubectl apply -f kubernetes/addons/envoy-gateway/gatewayclass.yml
kubectl apply -f kubernetes/addons/envoy-gateway/gateway.yml
```

Check the cluster:

```bash
kubectl get pods -A
kubectl get svc -A
kubectl get gatewayclass
kubectl get gateway -A
kubectl -n metallb-system get ipaddresspool,l2advertisement
```

## 7. Set Up Secrets And Flux

Install local tooling:

```bash
brew install sops age fluxcd/tap/flux
```

Generate a SOPS age key locally:

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
grep '^# public key:' ~/.config/sops/age/keys.txt
```

Put the printed public key into `.sops.yaml`, replacing
`REPLACE_WITH_AGE_PUBLIC_KEY`.

Create a Flux deploy key:

```bash
ssh-keygen -t ed25519 -C flux-edinstance-lab -f ~/.ssh/edinstance-lab-flux
```

Add `~/.ssh/edinstance-lab-flux.pub` to GitHub as a read-only deploy key for
this repository.

Bootstrap Flux:

```bash
export KUBECONFIG=~/.kube/homelab
export FLUX_GIT_IDENTITY_FILE=~/.ssh/edinstance-lab-flux
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
export GRAFANA_ADMIN_PASSWORD='<strong-password>'

ansible-playbook -i ansible/inventory.ini ansible/playbooks/04-flux-bootstrap.yml
```

After this, ongoing deploys should be done through GitOps:

```text
edit manifests -> commit -> push -> Flux reconciles
```

Flux applies the repo in this order:

```text
secrets -> addons -> platform -> apps
```

## 8. Ongoing Secrets

Only commit encrypted secret files:

```text
kubernetes/secrets/*.sops.yml
```

Do not commit plaintext secret manifests, kubeconfigs, age private keys, Flux
private deploy keys, `.env` files, or backup archives.

Example for Grafana:

```bash
cp kubernetes/secrets/grafana-admin.example.yml /tmp/grafana-admin.yml
# Edit /tmp/grafana-admin.yml with real values.
sops --encrypt /tmp/grafana-admin.yml > kubernetes/secrets/grafana-admin.sops.yml
rm /tmp/grafana-admin.yml
```

Add the encrypted file to `kubernetes/secrets/kustomization.yml`:

```yaml
resources:
  - grafana-admin.sops.yml
```

Commit and push the encrypted file. Flux will decrypt it in-cluster using the
`flux-system/sops-age` secret.

## 9. Health Checks

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
