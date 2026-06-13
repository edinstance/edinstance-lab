#!/usr/bin/env bash
set -euo pipefail

CONTEXT=""
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage:
  scripts/reconcile-flux.sh [--context <name>] [--dry-run]

Requests an immediate reconciliation of every namespaced Flux Toolkit resource
in the current Kubernetes context. Source resources are requested first, then
all remaining Flux resources across every namespace.

Options:
  --context <name>  Use a specific kubeconfig context.
  --dry-run         Print the resources that would be reconciled.
  --help, -h        Show this help.
USAGE
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --context)
      [ "$#" -ge 2 ] || die "--context requires a value"
      CONTEXT="$2"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
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

command -v kubectl >/dev/null 2>&1 || die "Missing required command: kubectl"

KUBECTL=(kubectl)
if [ -n "$CONTEXT" ]; then
  KUBECTL+=(--context "$CONTEXT")
fi

CURRENT_CONTEXT="$("${KUBECTL[@]}" config current-context)"
[ -n "$CURRENT_CONTEXT" ] || die "No Kubernetes context is selected"

mapfile -t API_RESOURCES < <(
  "${KUBECTL[@]}" api-resources \
    --namespaced=true \
    --verbs=list,patch \
    -o name \
    | awk '/\.toolkit\.fluxcd\.io$/ { print }' \
    | sort
)

[ "${#API_RESOURCES[@]}" -gt 0 ] || die "No namespaced Flux Toolkit resources found in context: $CURRENT_CONTEXT"

SOURCE_RESOURCES=()
OTHER_RESOURCES=()
for resource in "${API_RESOURCES[@]}"; do
  case "$resource" in
    *.source.toolkit.fluxcd.io)
      SOURCE_RESOURCES+=("$resource")
      ;;
    *)
      OTHER_RESOURCES+=("$resource")
      ;;
  esac
done

REQUESTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

reconcile_group() {
  local heading="$1"
  shift
  local resource
  local -a objects

  [ "$#" -gt 0 ] || return 0
  printf '\n==> %s\n' "$heading"

  for resource in "$@"; do
    mapfile -t objects < <(
      "${KUBECTL[@]}" get "$resource" --all-namespaces \
        -o go-template='{{range .items}}{{printf "%s/%s\n" .metadata.namespace .metadata.name}}{{end}}'
    )

    for object in "${objects[@]}"; do
      [ -n "$object" ] || continue
      printf '%s %s\n' "$resource" "$object"
      if [ "$DRY_RUN" = "0" ]; then
        "${KUBECTL[@]}" annotate "$resource" \
          --namespace "${object%%/*}" \
          "${object#*/}" \
          reconcile.fluxcd.io/requestedAt="$REQUESTED_AT" \
          --overwrite >/dev/null
      fi
    done
  done
}

printf 'Kubernetes context: %s\n' "$CURRENT_CONTEXT"
printf 'Requested at: %s\n' "$REQUESTED_AT"
if [ "$DRY_RUN" = "1" ]; then
  printf 'Mode: dry run\n'
fi

reconcile_group "Requesting Flux source reconciliations" "${SOURCE_RESOURCES[@]}"
reconcile_group "Requesting remaining Flux reconciliations" "${OTHER_RESOURCES[@]}"

printf '\nReconciliation requested for all discovered Flux resources.\n'
