#!/bin/sh
set -eu

# Escape for a JSON string: drop control characters (tabs, line breaks), then escape backslashes and quotes.
url=$(printf '%s' "${MADAR_ERPNEXT_URL:-}" | tr -d '[:cntrl:]' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

desk=$(printf '%s' "${MADAR_DESK_URL:-}" | tr -d '[:cntrl:]' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

cat > /usr/share/nginx/html/config.json <<JSON
{
  "erpnextUrl": "${url}",
  "deskUrl": "${desk}"
}
JSON
