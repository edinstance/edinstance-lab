#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INVENTORY="${INVENTORY:-$ROOT_DIR/ansible/inventory.ini}"
SET_HOSTNAMES="${SET_HOSTNAMES:-1}"
REBOOT="${REBOOT:-0}"
CHECK_ONLY="${CHECK_ONLY:-0}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/prepare-nodes.sh [--reboot] [--no-hostnames] [--check-only]

Prepares Kubernetes nodes using the existing Ansible playbooks:

  1. checks Ansible access to k8s_nodes
  2. optionally sets each node hostname from its inventory name
  3. runs OS prerequisites
  4. configures containerd
  5. installs Kubernetes packages
  6. optionally reboots nodes and verifies access again

This script is non-destructive. It does not run kubeadm reset, kubeadm init,
kubeadm join, Cilium install, Flux bootstrap, or addon deployment.

Environment overrides:
  INVENTORY=/path/to/inventory.ini
  ASK_BECOME_PASS=1
  SET_HOSTNAMES=0
  REBOOT=1
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
    --reboot)
      REBOOT=1
      ;;
    --no-hostnames)
      SET_HOSTNAMES=0
      ;;
    --check-only)
      CHECK_ONLY=1
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

[ -f "$INVENTORY" ] || die "Inventory not found: $INVENTORY"

need_cmd ansible
need_cmd ansible-playbook
need_cmd ansible-inventory
need_cmd jq

cd "$ROOT_DIR"

ANSIBLE_BECOME_ARGS=()
if [ "${ASK_BECOME_PASS:-0}" = "1" ]; then
  ANSIBLE_BECOME_ARGS+=(--ask-become-pass)
fi

mapfile -t NODES < <(
  ansible -i "$INVENTORY" k8s_nodes --list-hosts \
    | sed '1d; /^[[:space:]]*$/d; s/^[[:space:]]*//'
)

[ "${#NODES[@]}" -gt 0 ] || die "No k8s_nodes hosts found in inventory"

log "Node preparation target"
printf 'Inventory: %s\n' "$INVENTORY"
printf 'Nodes: %s\n' "${NODES[*]}"
printf 'Set hostnames: %s\n' "$SET_HOSTNAMES"
printf 'Reboot after prep: %s\n' "$REBOOT"

log "Checking Ansible access"
run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes -m ping

if [ "$CHECK_ONLY" = "1" ]; then
  log "Check-only complete"
  exit 0
fi

if [ "$SET_HOSTNAMES" = "1" ]; then
  log "Setting node hostnames from inventory names"
  run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes --become -m hostname -a "name={{ inventory_hostname }}"
fi

log "Running OS prerequisites"
run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/00-os-prereqs.yml

log "Configuring containerd"
run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/01-containerd.yml

log "Installing Kubernetes packages"
run ansible-playbook "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" ansible/playbooks/02-kubernetes-packages.yml

if [ "$REBOOT" = "1" ]; then
  log "Rebooting nodes"
  run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes --become -m reboot

  log "Verifying Ansible access after reboot"
  run ansible "${ANSIBLE_BECOME_ARGS[@]}" -i "$INVENTORY" k8s_nodes -m ping
fi

log "Node preparation complete"
