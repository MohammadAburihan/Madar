#!/bin/sh
# (Re)creates the disposable ERPNext site used for Madar development and seeds it with mock-like data.
# Runs inside the frappe_docker pwd.yml stack; never touches the default "frontend" site.
set -eu

SITE=madar-test.localhost
PORT=8081
FRAPPE_DOCKER="${FRAPPE_DOCKER:-$(dirname "$0")/../../frappe_docker}"
cd "$FRAPPE_DOCKER"

docker compose -f pwd.yml exec -T backend bench drop-site "$SITE" --db-root-username root --db-root-password admin --force --no-backup 2>/dev/null || true
docker compose -f pwd.yml exec -T backend bench new-site "$SITE" --mariadb-user-host-login-scope='%' \
  --admin-password=admin --db-root-username=root --db-root-password=admin --install-app erpnext --install-app hrms

# Reuse the stack's own network, sites volume, and image rather than assuming compose project names.
backend=$(docker compose -f pwd.yml ps -q backend)
network=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$backend")
volume=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/frappe/frappe-bench/sites"}}{{.Name}}{{end}}{{end}}' "$backend")
image=$(docker inspect -f '{{.Config.Image}}' "$backend")

# pwd.yml pins every request to the "frontend" site, so this site gets its own web container.
docker rm -f madar-test-frontend >/dev/null 2>&1 || true
docker run -d --name madar-test-frontend --network "$network" -p "$PORT:8080" \
  -e BACKEND=backend:8000 -e FRAPPE_SITE_NAME_HEADER="$SITE" -e SOCKETIO=websocket:9000 \
  -e UPSTREAM_REAL_IP_ADDRESS=127.0.0.1 -e UPSTREAM_REAL_IP_HEADER=X-Forwarded-For -e UPSTREAM_REAL_IP_RECURSIVE=off \
  -e PROXY_READ_TIMEOUT=120 -e CLIENT_MAX_BODY_SIZE=50m \
  -v "$volume:/home/frappe/frappe-bench/sites" "$image" nginx-entrypoint.sh >/dev/null

tries=0
until curl -sf "http://localhost:$PORT/api/method/frappe.ping" >/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "madar-test-frontend did not answer on port $PORT after 60s; see: docker logs madar-test-frontend" >&2
    exit 1
  fi
  sleep 1
done

jar=$(mktemp)
curl -sf -c "$jar" -X POST "http://localhost:$PORT/api/method/login" -H 'Content-Type: application/json' \
  -d '{"usr":"Administrator","pwd":"admin"}' >/dev/null
curl -sf -b "$jar" -X POST "http://localhost:$PORT/api/method/frappe.desk.page.setup_wizard.setup_wizard.setup_complete" \
  --data-urlencode 'args={"language":"English","country":"Palestinian Territory, Occupied","timezone":"Asia/Hebron","currency":"ILS","full_name":"Rehan Mansour","email":"rehan@rehan.example","password":"Madar-Dev-2026","company_name":"Rehan Nursery","company_abbr":"RN","chart_of_accounts":"Standard","fy_start_date":"2026-01-01","fy_end_date":"2026-12-31","setup_demo":0}' >/dev/null
rm -f "$jar"

cd - >/dev/null
node "$(dirname "$0")/seed-dev-data.mjs" --url "http://localhost:$PORT"
