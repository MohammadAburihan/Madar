#!/bin/sh
# Builds the ERPNext image plus the madar_setup app (erpnext-app/madar_setup) on top of the base image from
# scripts/build-erpnext-image.sh. Needs no network access to GitHub.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE:-madar-erpnext:v16.50.0-hrms}"
TAG="${TAG:-madar-erpnext:v16.50.0-hrms-setup-0.1.0}"

cd "$ROOT"
docker buildx build --load --platform "${PLATFORM:-linux/arm64}" \
  --build-arg BASE="$BASE" -t "$TAG" -f docker/erpnext-setup/Containerfile .
