# Madar — مدار

A simple business-management app for web, Android, and iOS, built on ERPNext. Madar gives everyday users
clear, task-focused screens for sales, purchasing, inventory, payments, and projects, while ERPNext stays
the system of record. English and Arabic (RTL) are fully supported.

See [`docs/Madar_Project_Overview.md`](docs/Madar_Project_Overview.md) for the product brief and release 1
scope.

## Stack

- **Frontend:** Angular, using the container/presenter pattern
- **Mobile:** Capacitor (Android and iOS) with Ionic for Angular
- **Backend:** ERPNext, one installation per business
- **Deployment:** each release is a versioned Docker image (nginx serving the web build) running on AWS
  next to the ERPNext containers

## Repository layout

```
src/app/core/       config, i18n, ERPNext client
src/app/shared/ui/  reusable presenters
src/app/features/   one folder per business area (containers, components, data-access)
public/             static assets, translations (i18n/), runtime config.json
android/, ios/      Capacitor native projects
docker/             nginx config and startup script for the release image
docs/               product brief, design handoff, and the Madar.pen design file
CLAUDE.md           conventions for AI-assisted development
```

## Local development

### ERPNext backend

ERPNext runs in Docker from a sibling clone of [frappe_docker](https://github.com/frappe/frappe_docker):

```sh
cd ../frappe_docker
docker compose -f pwd.yml up -d
```

Open http://localhost:8080 and sign in as `Administrator` / `admin` (local development only).

Stop it with `docker compose -f pwd.yml down`. Adding `-v` deletes the local data.

### Frontend

Requires Node.js 24 or newer.

```sh
npm install
npm start          # http://localhost:4200, proxies API calls to ERPNext on :8080
npm test
```

### Mobile

```sh
npm run cap:sync
npx cap open android   # needs Android Studio
npx cap open ios       # needs Xcode
```

## Release image

```sh
npm run docker:build   # builds madar-web:<version> for linux/amd64
```

Run it next to ERPNext:

```sh
docker run -d -p 8090:80 --network frappe_docker_frappe_network madar-web:<version>
```

| Variable | Default | Purpose |
|---|---|---|
| `ERPNEXT_UPSTREAM` | `http://frontend:8080` | ERPNext address nginx proxies `/api` and `/files` to |
| `ERPNEXT_SITE_HOST` | incoming host | Host header sent to ERPNext, to pin a specific site |
| `MADAR_ERPNEXT_URL` | empty (same origin) | ERPNext URL written into `config.json` for the app |

Health check: `GET /healthz`. The deployed version is served at `/version.txt`.

## Branches and releases

- `development` is the default branch.
- Work happens on feature branches merged into `development` through pull requests.
- Releases are tagged `vX.Y.Z` (matching `package.json`), and each one produces a Docker image tagged with the same version.
