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
  ANSIBLE_BECOME_ASK_PASS=true

Flux bootstrap expects ansible/playbooks/04-flux-bootstrap.yml prerequisites:
  FLUX_GIT_IDENTITY_FILE=/path/to/deploy_key
  SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt

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
if [ "${ASK_BECOME_PASS:-0}" = "1" ] || [ "${ANSIBLE_BECOME_ASK_PASS:-false}" = "true" ]; then
  BECOME_PASSWORD_FILE="$(mktemp "${TMPDIR:-/tmp}/rebuild-become.XXXXXX.json")"
  chmod 0600 "$BECOME_PASSWORD_FILE"
  trap 'rm -f "$BECOME_PASSWORD_FILE"' EXIT
  read -r -s -p "BECOME password: " BECOME_PASSWORD
  printf '\n'
  jq -n --arg password "$BECOME_PASSWORD" '{ansible_become_password: $password}' > "$BECOME_PASSWORD_FILE"
  unset BECOME_PASSWORD
  unset ANSIBLE_BECOME_ASK_PASS
  export ANSIBLE_BECOME_ASK_PASS=false
  ANSIBLE_BECOME_ARGS+=(-e "@$BECOME_PASSWORD_FILE")
fi

if [ -z "$FIRST_CONTROL_PLANE" ]; then
  FIRST_CONTROL_PLANE="$(
    ansible-inventory -i "$INVENTORY" --list \
      | jq -r '.k8s_control_plane.hosts[0] // empty'
  )"
fi

[ -n "$FIRST_CONTROL_PLANE" ] || die "Could not detect first control-plane host"

FIRST_CONTROL_PLANE_API_HOST="$(
  ansible-inventory -i "$INVENTORY" --list \
    | jq -r --arg host "$FIRST_CONTROL_PLANE" '._meta.hostvars[$host].ansible_host // $host'
)"
[ -n "$FIRST_CONTROL_PLANE_API_HOST" ] || die "Could not detect first control-plane API host"

K8S_API_VIP="$(
  ansible-inventory -i "$INVENTORY" --list \
    | jq -r --arg host "$FIRST_CONTROL_PLANE" '.all.vars.k8s_api_vip // ._meta.hostvars[$host].k8s_api_vip // empty'
)"
[ -n "$K8S_API_VIP" ] || die "Could not detect Kubernetes API VIP"

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
printf 'First control-plane API host: %s\n' "$FIRST_CONTROL_PLANE_API_HOST"
printf 'Kubernetes API VIP: %s\n' "$K8S_API_VIP"
printf 'Kubeconfig: %s\n' "$KUBECONFIG_PATH"
printf 'Flux bootstrap: %s\n' "$RUN_FLUX"

log "Checking Ansible access"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes -m ping

log "Removing Kubernetes, CNI, etcd, kubelet, and Longhorn state from all nodes"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes --become -m shell -a '
set -u
timeout 30s systemctl stop kubelet || true
if command -v crictl >/dev/null 2>&1; then
  timeout 30s crictl stopp $(crictl pods -q 2>/dev/null) 2>/dev/null || true
  timeout 30s crictl rmp -f $(crictl pods -q 2>/dev/null) 2>/dev/null || true
fi
timeout 30s systemctl stop containerd || true
timeout 2m kubeadm reset -f --cri-socket unix:///run/containerd/containerd.sock || true
if command -v findmnt >/dev/null 2>&1; then
  while IFS= read -r mountpoint; do
    [ -n "$mountpoint" ] || continue
    timeout 10s umount -l "$mountpoint" || true
  done <<EOF
$(findmnt -R /var/run/cilium -n -o TARGET 2>/dev/null | sort -r)
EOF
fi
timeout 30s rm -rf /etc/kubernetes || true
timeout 30s rm -rf /var/lib/etcd || true
timeout 30s rm -rf /var/lib/kubelet || true
timeout 2m rm -rf /run/containerd || true
timeout 2m rm -rf /var/lib/containerd || true
timeout 30s rm -rf /etc/cni/net.d || true
timeout 30s rm -rf /var/lib/cni || true
if [ -d /var/run/cilium ]; then
  find /var/run/cilium -mindepth 1 -maxdepth 1 ! -name cgroupv2 -exec rm -rf {} + 2>/dev/null || true
  rmdir /var/run/cilium/cgroupv2 2>/dev/null || true
  rmdir /var/run/cilium 2>/dev/null || true
fi
timeout 2m rm -rf /var/lib/longhorn || true
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

log "Installing kube-vip bootstrap static pod manifest on first control-plane node"
run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/03-kube-vip-bootstrap.yml \
  --limit "$FIRST_CONTROL_PLANE" \
  -e "first_control_plane=$FIRST_CONTROL_PLANE"

log "Copying kubeadm config to first control-plane node"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m copy \
  -a "src=$ROOT_DIR/kubernetes/bootstrap/kubeadm-config.yml dest=/tmp/kubeadm-config.yml mode=0644"

log "Ensuring first control-plane ports are free before kubeadm init"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m shell -a '
set -u
if command -v ss >/dev/null 2>&1; then
  ss -H -ltnp "( sport = :6443 or sport = :10257 or sport = :10259 )" || true
fi
if command -v crictl >/dev/null 2>&1; then
  for name in kube-apiserver kube-controller-manager kube-scheduler; do
    crictl ps -a --name "$name" -q 2>/dev/null | xargs -r crictl rm -f 2>/dev/null || true
  done
fi
if command -v ctr >/dev/null 2>&1; then
  ctr --namespace k8s.io tasks ls 2>/dev/null | awk "/kube-apiserver|kube-controller-manager|kube-scheduler/ {print \$1}" | xargs -r -n1 ctr --namespace k8s.io tasks kill --signal SIGKILL 2>/dev/null || true
  ctr --namespace k8s.io containers ls 2>/dev/null | awk "/kube-apiserver|kube-controller-manager|kube-scheduler/ {print \$1}" | xargs -r -n1 ctr --namespace k8s.io containers rm 2>/dev/null || true
fi
if command -v fuser >/dev/null 2>&1; then
  fuser -k 6443/tcp 10257/tcp 10259/tcp 2>/dev/null || true
fi
'

log "Initializing first control-plane node"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m command \
  -a "kubeadm init --config /tmp/kubeadm-config.yml --upload-certs --skip-phases=addon/kube-proxy"

mkdir -p "$(dirname "$KUBECONFIG_PATH")" "$ROOT_DIR/.tmp"

log "Fetching admin kubeconfig"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m fetch \
  -a "src=/etc/kubernetes/admin.conf dest=$ROOT_DIR/.tmp/admin.conf flat=true"
install -m 0600 "$ROOT_DIR/.tmp/admin.conf" "$KUBECONFIG_PATH"
export KUBECONFIG="$KUBECONFIG_PATH"
run kubectl config set-cluster kubernetes --server="https://${FIRST_CONTROL_PLANE_API_HOST}:6443"

log "Pointing bootstrap admin kubeconfig at the first control-plane node"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m command \
  -a "kubectl --kubeconfig=/etc/kubernetes/admin.conf config set-cluster kubernetes --server=https://${FIRST_CONTROL_PLANE_API_HOST}:6443"

log "Uploading bootstrap kubeadm config with first-node controlPlaneEndpoint"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m shell -a "
set -eu
cp /tmp/kubeadm-config.yml /tmp/kubeadm-bootstrap-join-config.yml
sed -i 's#^controlPlaneEndpoint: .*#controlPlaneEndpoint: \"${FIRST_CONTROL_PLANE_API_HOST}:6443\"#' /tmp/kubeadm-bootstrap-join-config.yml
kubeadm init phase upload-config kubeadm --config /tmp/kubeadm-bootstrap-join-config.yml
"

log "Pointing bootstrap discovery kubeconfig at the first control-plane node"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m shell -a "
set -eu
kubectl --kubeconfig=/etc/kubernetes/admin.conf -n kube-public get configmap cluster-info -o jsonpath='{.data.kubeconfig}' \
  | sed 's#https://[^:]*:6443#https://${FIRST_CONTROL_PLANE_API_HOST}:6443#g' \
  > /tmp/cluster-info-bootstrap.kubeconfig
kubectl --kubeconfig=/etc/kubernetes/admin.conf -n kube-public create configmap cluster-info \
  --from-file=kubeconfig=/tmp/cluster-info-bootstrap.kubeconfig \
  --dry-run=client -o yaml \
  | kubectl --kubeconfig=/etc/kubernetes/admin.conf apply -f -
rm -f /tmp/cluster-info-bootstrap.kubeconfig
"

log "Installing Cilium"
run helm repo add cilium https://helm.cilium.io
run helm repo update
run helm upgrade --install cilium cilium/cilium \
  --namespace kube-system \
  --version 1.19.4 \
  --values kubernetes/addons/cilium/values.yml \
  --set "k8sServiceHost=${FIRST_CONTROL_PLANE_API_HOST}"

log "Waiting for first node and Cilium"
run kubectl wait --for=condition=Ready "node/$FIRST_CONTROL_PLANE" --timeout=10m
run kubectl -n kube-system rollout status ds/cilium --timeout=10m

if [ "${#JOIN_CONTROL_PLANES[@]}" -gt 0 ]; then
  log "Generating control-plane join command"
  JOIN_OUTPUT_FILE="$ROOT_DIR/.tmp/join-output.txt"
  run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m shell -a '
set -eu
echo "JOIN:"
kubeadm token create --print-join-command
echo "CERT:"
kubeadm init phase upload-certs --upload-certs
' | tee "$JOIN_OUTPUT_FILE"
  JOIN_BASE="$(sed -n "s/.*\\(kubeadm join .*$\\)/\\1/p" "$JOIN_OUTPUT_FILE" | head -1)"
  CERT_KEY="$(awk "/^[a-f0-9]{64}$/ {print; exit}" "$JOIN_OUTPUT_FILE")"
  [ -n "$JOIN_BASE" ] || die "Failed to generate kubeadm join base command"
  [ -n "$CERT_KEY" ] || die "Failed to generate kubeadm certificate key"
  JOIN_COMMAND="$JOIN_BASE --control-plane --certificate-key $CERT_KEY"
  [ -n "$JOIN_COMMAND" ] || die "Failed to generate control-plane join command"
  printf 'Join command: %s\n' "$JOIN_COMMAND"

  for host in "${JOIN_CONTROL_PLANES[@]}"; do
    log "Ensuring control-plane ports are free before kubeadm join on: $host"
    run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$host" --become -m shell -a '
set -u
if command -v ss >/dev/null 2>&1; then
  ss -H -ltnp "( sport = :6443 or sport = :10257 or sport = :10259 )" || true
fi
if command -v crictl >/dev/null 2>&1; then
  for name in kube-apiserver kube-controller-manager kube-scheduler; do
    crictl ps -a --name "$name" -q 2>/dev/null | xargs -r crictl rm -f 2>/dev/null || true
  done
fi
if command -v ctr >/dev/null 2>&1; then
  ctr --namespace k8s.io tasks ls 2>/dev/null | awk "/kube-apiserver|kube-controller-manager|kube-scheduler/ {print \$1}" | xargs -r -n1 ctr --namespace k8s.io tasks kill --signal SIGKILL 2>/dev/null || true
  ctr --namespace k8s.io containers ls 2>/dev/null | awk "/kube-apiserver|kube-controller-manager|kube-scheduler/ {print \$1}" | xargs -r -n1 ctr --namespace k8s.io containers rm 2>/dev/null || true
fi
if command -v fuser >/dev/null 2>&1; then
  fuser -k 6443/tcp 10257/tcp 10259/tcp 2>/dev/null || true
fi
'
    log "Joining control-plane node: $host"
    run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$host" --become -m shell -a "$JOIN_COMMAND"
    log "Installing kube-vip static pod manifest on joined control-plane node: $host"
    run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/03-kube-vip.yml --limit "$host"
  done

  log "Restoring VIP-based kubeadm config"
  run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m command \
    -a "kubeadm init phase upload-config kubeadm --config /tmp/kubeadm-config.yml"

  log "Restoring VIP-based discovery kubeconfig"
  run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" "$FIRST_CONTROL_PLANE" --become -m shell -a "
set -eu
kubectl --kubeconfig=/etc/kubernetes/admin.conf -n kube-public get configmap cluster-info -o jsonpath='{.data.kubeconfig}' \
  | sed 's#https://[^:]*:6443#https://${K8S_API_VIP}:6443#g' \
  > /tmp/cluster-info-vip.kubeconfig
kubectl --kubeconfig=/etc/kubernetes/admin.conf -n kube-public create configmap cluster-info \
  --from-file=kubeconfig=/tmp/cluster-info-vip.kubeconfig \
  --dry-run=client -o yaml \
  | kubectl --kubeconfig=/etc/kubernetes/admin.conf apply -f -
rm -f /tmp/cluster-info-vip.kubeconfig
"
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

if [ "$RUN_FLUX" = "1" ]; then
  log "Bootstrapping Flux controllers and initial secrets"
  run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/04-flux-bootstrap.yml
  run flux check
  run flux get kustomizations
fi

log "Destructive rebuild rehearsal complete"
