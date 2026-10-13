#!/bin/sh
set -eu

# Escape for a JSON string: backslashes and quotes, and drop any line breaks from env files.
url=$(printf '%s' "${MADAR_ERPNEXT_URL:-}" | tr -d '\r\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

cat > /usr/share/nginx/html/config.json <<JSON
{
  "erpnextUrl": "${url}"
}
JSON
