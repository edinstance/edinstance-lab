#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INVENTORY="${INVENTORY:-$ROOT_DIR/ansible/inventory.ini}"
CHECK_FLUX="${CHECK_FLUX:-0}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/preflight-rebuild-check.sh [--with-flux]

Runs non-destructive checks before the destructive rebuild rehearsal:

  - required local command availability
  - Ansible inventory shape
  - SSH/Ansible access to all Kubernetes nodes
  - required repo files
  - obvious placeholder values
  - optional Flux bootstrap inputs

Environment overrides:
  INVENTORY=/path/to/inventory.ini
  ASK_BECOME_PASS=1
  FLUX_GIT_IDENTITY_FILE=/path/to/deploy_key
  SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
  GRAFANA_ADMIN_PASSWORD=...
USAGE
}

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

pass() {
  printf 'OK: %s\n' "$*"
}

need_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1 found"
  else
    fail "Missing required command: $1"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --with-flux)
      CHECK_FLUX=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

cd "$ROOT_DIR"

ANSIBLE_BECOME_ARGS=()
if [ "${ASK_BECOME_PASS:-0}" = "1" ]; then
  ANSIBLE_BECOME_ARGS+=(--ask-become-pass)
fi

log "Checking local tools"
need_cmd ansible
need_cmd ansible-playbook
need_cmd ansible-inventory
need_cmd kubectl
need_cmd helm
need_cmd helmfile
need_cmd jq
need_cmd curl
need_cmd rg

if [ "$CHECK_FLUX" = "1" ]; then
  need_cmd flux
fi

log "Checking required files"
for path in \
  "$INVENTORY" \
  ansible/group_vars/all.yml \
  ansible/playbooks/00-os-prereqs.yml \
  ansible/playbooks/01-containerd.yml \
  ansible/playbooks/02-kubernetes-packages.yml \
  ansible/playbooks/03-kube-vip-bootstrap.yml \
  ansible/playbooks/03-kube-vip.yml \
  ansible/playbooks/04-flux-bootstrap.yml \
  kubernetes/bootstrap/kubeadm-config.yml \
  kubernetes/addons/cilium/values.yml \
  kubernetes/addons/metallb/kustomization.yml \
  kubernetes/addons/metallb/ip-address-pool.yml \
  kubernetes/addons/envoy-gateway/kustomization.yml \
  kubernetes/addons/envoy-gateway/gatewayclass.yml \
  kubernetes/addons/envoy-gateway/gateway.yml \
  apps/kustomization.yml \
  helmfile.yaml; do
  [ -f "$path" ] && pass "$path exists" || fail "$path is missing"
done

log "Checking inventory"
mapfile -t CONTROL_PLANES < <(
  ansible-inventory -i "$INVENTORY" --list \
    | jq -r '.k8s_control_plane.hosts[]?'
)

[ "${#CONTROL_PLANES[@]}" -gt 0 ] || fail "No k8s_control_plane hosts found"
printf 'Control-plane hosts: %s\n' "${CONTROL_PLANES[*]}"

log "Checking Ansible access"
ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes -m ping

log "Checking important repo values"
if rg -n 'example|placeholder|TODO|<password>|<cloudflare|<.*token' \
  .sops.yaml \
  kubernetes/addons/flux/source.yml \
  kubernetes/secrets \
  ansible/group_vars/all.yml >/tmp/preflight-placeholders.$$ 2>/dev/null; then
  cat /tmp/preflight-placeholders.$$
  rm -f /tmp/preflight-placeholders.$$
  warn "Placeholder/example values remain. Some are fine as examples, but real secrets must exist before Flux owns them."
else
  rm -f /tmp/preflight-placeholders.$$
  pass "No obvious placeholders found in checked files"
fi

log "Checking rendered Kubernetes YAML"
kubectl kustomize apps >/dev/null
kubectl kustomize kubernetes/addons/envoy-gateway >/dev/null
kubectl kustomize kubernetes/addons/metallb >/dev/null
pass "apps kustomization renders"
pass "Envoy Gateway kustomization renders"
pass "MetalLB kustomization renders"

if [ "$CHECK_FLUX" = "1" ]; then
  log "Checking Flux bootstrap inputs"

  FLUX_GIT_IDENTITY_FILE="${FLUX_GIT_IDENTITY_FILE:-}"
  SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
  GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-}"

  [ -n "$FLUX_GIT_IDENTITY_FILE" ] || fail "FLUX_GIT_IDENTITY_FILE is required with --with-flux"
  [ -f "$FLUX_GIT_IDENTITY_FILE" ] || fail "Flux deploy key not found: $FLUX_GIT_IDENTITY_FILE"
  [ -f "$FLUX_GIT_IDENTITY_FILE.pub" ] || fail "Flux deploy public key not found: $FLUX_GIT_IDENTITY_FILE.pub"
  [ -f "$SOPS_AGE_KEY_FILE" ] || fail "SOPS age key not found: $SOPS_AGE_KEY_FILE"
  [ -n "$GRAFANA_ADMIN_PASSWORD" ] || fail "GRAFANA_ADMIN_PASSWORD is required with --with-flux"

  pass "Flux bootstrap inputs are present"
fi

log "Preflight complete"
