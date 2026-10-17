#!/bin/sh
# Builds the ERPNext image Madar develops against: ERPNext plus Frappe HR (Workers & HR), from frappe_docker's
# layered Containerfile. ../frappe_docker/pwd.yml runs it in place of frappe/erpnext.
set -eu

FRAPPE_DOCKER="${FRAPPE_DOCKER:-$(dirname "$0")/../../frappe_docker}"
APPS_JSON="$(cd "$(dirname "$0")/../docker/erpnext" && pwd)/apps.json"
TAG="${TAG:-madar-erpnext:v16.50.0-hrms}"

cd "$FRAPPE_DOCKER"
# FRAPPE_BRANCH also names the frappe/build base image, which has no per-release tags: Frappe follows version-16.
docker buildx build --load --platform "${PLATFORM:-linux/arm64}" \
  --build-arg FRAPPE_BRANCH=version-16 \
  --secret id=apps_json,src="$APPS_JSON" \
  -t "$TAG" -f images/layered/Containerfile .
