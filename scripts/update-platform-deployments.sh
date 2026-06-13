#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! $1 =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <git-sha>" >&2
  exit 2
fi

sha="$1"
repo="${GITHUB_REPOSITORY:-edinstance/edinstance-lab}"

update_image() {
  local component="$1"
  local file="$2"
  local image="ghcr.io/${repo}/${component}:sha-${sha}"

  perl -0pi -e "s#image: ghcr\\.io/\\Q${repo}\\E/\\Q${component}\\E:sha-[0-9a-f]{7,40}#image: ${image}#" "$file"
  if ! grep -Fq "image: ${image}" "$file"; then
    echo "Failed to update ${file} to ${image}" >&2
    exit 1
  fi
}

update_image frontend kubernetes/platform/frontend/deployment.yml
update_image platform-api kubernetes/platform/api/deployment.yml

perl -0pi -e "s#(name: OTEL_SERVICE_VERSION\n\s+value:) sha-[0-9a-f]{7,40}#\$1 sha-${sha}#g" \
  kubernetes/platform/frontend/deployment.yml \
  kubernetes/platform/api/deployment.yml

for file in kubernetes/platform/frontend/deployment.yml kubernetes/platform/api/deployment.yml; do
  if ! grep -A1 -F "name: OTEL_SERVICE_VERSION" "$file" | grep -Fq "value: sha-${sha}"; then
    echo "Failed to update OTEL_SERVICE_VERSION in ${file} to sha-${sha}" >&2
    exit 1
  fi
done

git diff -- \
  kubernetes/platform/frontend/deployment.yml \
  kubernetes/platform/api/deployment.yml
