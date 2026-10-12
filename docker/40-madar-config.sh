#!/bin/sh
set -eu

cat > /usr/share/nginx/html/config.json <<JSON
{
  "erpnextUrl": "${MADAR_ERPNEXT_URL}"
}
JSON
