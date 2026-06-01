#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INVENTORY="${INVENTORY:-$ROOT_DIR/ansible/inventory.ini}"
KUBECONFIG_PATH="${KUBECONFIG_PATH:-$HOME/.kube/homelab}"
FIRST_CONTROL_PLANE="${FIRST_CONTROL_PLANE:-}"
RUN_FLUX="${RUN_FLUX:-0}"
YES="${YES:-0}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/destructive-rebuild-rehearsal.sh --yes [--with-flux]

This destructively resets the Kubernetes nodes in ansible/inventory.ini and
rebuilds the v1 rehearsal cluster:

  1. kubeadm/CNI/kubelet/etcd/Longhorn state removal on all nodes
  2. OS/containerd/Kubernetes package prep through Ansible
  3. kube-vip static pod generation
  4. kubeadm init on the first control-plane node
  5. Cilium install
  6. additional control-plane joins
  7. helmfile addon sync
  8. Gateway/MetalLB/whoami smoke test
  9. optional Flux bootstrap with --with-flux

Environment overrides:
  INVENTORY=/path/to/inventory.ini
  KUBECONFIG_PATH=~/.kube/homelab
  FIRST_CONTROL_PLANE=k8s-1
  RUN_FLUX=1
  ASK_BECOME_PASS=1

Flux bootstrap expects ansible/playbooks/04-flux-bootstrap.yml prerequisites:
  FLUX_GIT_IDENTITY_FILE=/path/to/deploy_key
  SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
  GRAFANA_ADMIN_PASSWORD=...

This is intended before important stateful workloads exist. It removes
/var/lib/etcd, /var/lib/kubelet, /etc/kubernetes, CNI state, and /var/lib/longhorn.
USAGE
}

log() {
  printf '\n==> %s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  "$@"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes|-y)
      YES=1
      ;;
    --with-flux)
      RUN_FLUX=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
  shift
done

[ "$YES" = "1" ] || die "Refusing to run without --yes"
[ -f "$INVENTORY" ] || die "Inventory not found: $INVENTORY"

need_cmd ansible
need_cmd ansible-playbook
need_cmd kubectl
need_cmd helm
need_cmd helmfile
need_cmd jq

if [ "$RUN_FLUX" = "1" ]; then
  need_cmd flux
fi

cd "$ROOT_DIR"

ANSIBLE_BECOME_ARGS=()
if [ "${ASK_BECOME_PASS:-0}" = "1" ]; then
  ANSIBLE_BECOME_ARGS+=(--ask-become-pass)
fi

if [ -z "$FIRST_CONTROL_PLANE" ]; then
  FIRST_CONTROL_PLANE="$(
    ansible-inventory -i "$INVENTORY" --list \
      | jq -r '.k8s_control_plane.hosts[0] // empty'
  )"
fi

[ -n "$FIRST_CONTROL_PLANE" ] || die "Could not detect first control-plane host"

mapfile -t CONTROL_PLANES < <(
  ansible-inventory -i "$INVENTORY" --list \
    | jq -r '.k8s_control_plane.hosts[]'
)

[ "${#CONTROL_PLANES[@]}" -gt 0 ] || die "No k8s_control_plane hosts found"

JOIN_CONTROL_PLANES=()
for host in "${CONTROL_PLANES[@]}"; do
  if [ "$host" != "$FIRST_CONTROL_PLANE" ]; then
    JOIN_CONTROL_PLANES+=("$host")
  fi
done

log "Destructive reset target"
printf 'Inventory: %s\n' "$INVENTORY"
printf 'First control plane: %s\n' "$FIRST_CONTROL_PLANE"
printf 'Kubeconfig: %s\n' "$KUBECONFIG_PATH"
printf 'Flux bootstrap: %s\n' "$RUN_FLUX"

log "Checking Ansible access"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes -m ping

log "Removing Kubernetes, CNI, etcd, kubelet, and Longhorn state from all nodes"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes --become -m shell -a '
set -eu
kubeadm reset -f || true
systemctl stop kubelet || true
systemctl stop containerd || true
rm -rf /etc/kubernetes
rm -rf /var/lib/etcd
rm -rf /var/lib/kubelet
rm -rf /etc/cni/net.d
rm -rf /var/lib/cni
rm -rf /var/run/cilium
rm -rf /var/lib/longhorn
ip link delete cilium_host 2>/dev/null || true
ip link delete cilium_net 2>/dev/null || true
ip link delete cilium_vxlan 2>/dev/null || true
iptables -F || true
iptables -t nat -F || true
iptables -t mangle -F || true
iptables -X || true
systemctl start containerd || true
systemctl start kubelet || true
'

log "Preparing OS, containerd, and Kubernetes packages"
run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/00-os-prereqs.yml
run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/01-containerd.yml
run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/02-kubernetes-packages.yml

log "Setting node hostnames from inventory names"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes --become -m hostname -a "name={{ inventory_hostname }}"

log "Installing kube-vip static pod manifests"
run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/03-kube-vip.yml

log "Copying kubeadm config to first control-plane node"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m copy \
  -a "src=$ROOT_DIR/kubernetes/bootstrap/kubeadm-config.yml dest=/tmp/kubeadm-config.yml mode=0644"

log "Initializing first control-plane node"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m command \
  -a "kubeadm init --config /tmp/kubeadm-config.yml --upload-certs"

mkdir -p "$(dirname "$KUBECONFIG_PATH")" "$ROOT_DIR/.tmp"

log "Fetching admin kubeconfig"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m fetch \
  -a "src=/etc/kubernetes/admin.conf dest=$ROOT_DIR/.tmp/admin.conf flat=true"
install -m 0600 "$ROOT_DIR/.tmp/admin.conf" "$KUBECONFIG_PATH"
export KUBECONFIG="$KUBECONFIG_PATH"

log "Installing Cilium"
run helm repo add cilium https://helm.cilium.io
run helm repo update
run helm upgrade --install cilium cilium/cilium \
  --namespace kube-system \
  --version 1.19.4 \
  --values kubernetes/addons/cilium/values.yml

log "Waiting for first node and Cilium"
run kubectl wait --for=condition=Ready "node/$FIRST_CONTROL_PLANE" --timeout=10m
run kubectl -n kube-system rollout status ds/cilium --timeout=10m

if [ "${#JOIN_CONTROL_PLANES[@]}" -gt 0 ]; then
  log "Generating control-plane join command"
  JOIN_COMMAND="$(
    ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m shell -a '
set -euo pipefail
join_cmd="$(kubeadm token create --print-join-command)"
cert_key="$(kubeadm init phase upload-certs --upload-certs 2>/dev/null | tail -n 1)"
printf "%s --control-plane --certificate-key %s\n" "$join_cmd" "$cert_key"
' | awk '/kubeadm join / {print; exit}'
  )"
  [ -n "$JOIN_COMMAND" ] || die "Failed to generate control-plane join command"

  for host in "${JOIN_CONTROL_PLANES[@]}"; do
    log "Joining control-plane node: $host"
    run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$host" --become -m shell -a "$JOIN_COMMAND"
  done
fi

log "Waiting for all nodes to become Ready"
for host in "${CONTROL_PLANES[@]}"; do
  run kubectl wait --for=condition=Ready "node/$host" --timeout=15m
done

log "Allowing workloads on the three schedulable control-plane nodes"
kubectl taint nodes --all node-role.kubernetes.io/control-plane- 2>/dev/null || true

log "Installing Helm-managed addons"
run helmfile sync
run kubectl apply -k kubernetes/addons/metallb
run kubectl apply -k kubernetes/addons/envoy-gateway

log "Waiting for core addon rollouts"
kubectl -n kube-system rollout status deployment/metrics-server --timeout=5m || true
kubectl -n metallb-system rollout status deployment/metallb-controller --timeout=5m
kubectl -n metallb-system rollout status daemonset/metallb-speaker --timeout=5m
kubectl -n gateway-system rollout status deployment/envoy-gateway --timeout=5m

log "Deploying whoami smoke app"
run kubectl apply -k apps
run kubectl -n apps rollout status deployment/whoami --timeout=5m

log "Checking Gateway and HTTPRoute status"
run kubectl get nodes -o wide
run kubectl get pods -A
run kubectl get gatewayclass
run kubectl get gateway -A
run kubectl get httproute -A

log "Running local HTTP smoke test through Envoy ingress IP"
run curl -fsS -H "Host: whoami.local.edinstance.com" http://192.168.2.100/

if [ "$RUN_FLUX" = "1" ]; then
  log "Bootstrapping Flux controllers and initial secrets"
  run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/04-flux-bootstrap.yml
  run flux check
  run flux get kustomizations
fi

log "Destructive rebuild rehearsal complete"
