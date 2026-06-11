#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/edinstance/edinstance-lab/platform-api}"
SHORT_SHA="${SHORT_SHA:-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"
IMAGE_TAG="sha-${SHORT_SHA}"
IMAGE="${IMAGE_REPOSITORY}:${IMAGE_TAG}"

docker build -t "$IMAGE" "$ROOT_DIR/services/platform-api"
docker push "$IMAGE"

printf '%s\n' "$IMAGE"
