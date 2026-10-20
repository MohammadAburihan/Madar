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
assets/             source artwork for app icons and splash screens
android/, ios/      Capacitor native projects
docker/             nginx config and startup script for the release image
docs/               product brief, design handoff, roles (PERMISSIONS.md), and the Madar.pen design file
CLAUDE.md           conventions for AI-assisted development
```

## Local development

### ERPNext backend

ERPNext runs in Docker from a sibling clone of [frappe_docker](https://github.com/frappe/frappe_docker):

```sh
cd ../frappe_docker
docker compose -f pwd.yml up -d
```

In a fresh `frappe_docker` clone, change the `frontend` service's port in `pwd.yml` to `"18080:8080"` first. Open http://localhost:18080 and sign in as `Administrator` / `admin` (local development only).

Stop it with `docker compose -f pwd.yml down`. Adding `-v` deletes the local data.

#### Seeded test site

`pwd.yml` sends every request to its `frontend` site, so Madar's demo data lives in a separate, disposable
site with its own web container on port 18081:

```sh
sh scripts/dev-test-site.sh   # (re)creates madar-test.localhost and seeds it like the design mocks
```

It never touches the `frontend` site. Users (password `Madar-Dev-2026`):

| User | Role | Home variant |
|---|---|---|
| `rehan@rehan.example` | System Manager, the managers and HR Manager | Owner |
| `lina@rehan.example` | Sales User, Accounts User | Salesperson |
| `omar@rehan.example` | Stock User | Warehouse worker |
| `sami@rehan.example` | Sales User, Accounts User, Stock User | Store associate |
| `nadia@rehan.example` | Purchase User, Stock User, Accounts User | Purchasing officer |
| `yara@rehan.example` | Projects User, Stock User | Project manager |

The site also has the quick-sale catalogue from the mocks (olive tree, ceramic planter, garden consultation),
stock in Main warehouse and Garden shop, a Walk-in Customer, and Cash and Card (Main bank) payment accounts, and
the workers from the Workers mocks (Frappe HR): today's attendance, leave allocations and an approved leave.

"Today" data is created for the day the script runs; rerun it to refresh.

### Frontend

Requires Node.js 24 or newer.

```sh
npm install
npm start          # http://localhost:4200, proxies API calls to ERPNext on :18080
ERPNEXT_DEV_URL=http://localhost:18081 npm start   # same, against the seeded test site
npm test
```

### Mobile

Requires Xcode (iOS) and Android Studio with the Android SDK (`ANDROID_HOME`). Android builds need Java 21:
`export JAVA_HOME=$(/usr/libexec/java_home -v 21)`.

```sh
npm run android:dev    # run on the Android emulator against local ERPNext
npm run ios:dev        # run on the iOS simulator against local ERPNext (optional: simulator UDID)

npm run cap:sync       # production build for store releases
npx cap open android   # then Build → Generate Signed App Bundle
npx cap open ios       # then Product → Archive
```

`ios:dev` uses Xcode directly through `DEVELOPER_DIR`, so the system `xcode-select` setting is left alone.

Icons and splash screens come from `assets/` (`npx capacitor-assets generate`).

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
| `TRUST_FORWARDED_PROTO` | `0` | Set to `1` behind a TLS-terminating proxy (e.g. AWS ALB) to forward its `X-Forwarded-Proto` |
| `NGINX_RESOLVER` | the container's DNS servers | DNS server nginx uses to re-resolve `ERPNEXT_UPSTREAM` |
| `ERPNEXT_SITE_HOST` | incoming host | Host header sent to ERPNext, to pin a specific site |
| `MADAR_ERPNEXT_URL` | empty (same origin) | ERPNext URL written into `config.json` for the app |

### One business per deployment

Each business has its own Madar web address and its own ERPNext stack: separate containers, database and ports.
Run one madar-web container per business, each pointing at its own ERPNext:

```sh
# Rehan Nursery: its ERPNext stack's frontend is reachable as rehan-erpnext:8080
docker run -d --name madar-rehan -p 8091:80 -e ERPNEXT_UPSTREAM=http://rehan-erpnext:8080 \
  --network rehan_network madar-web:<version>
# Padel Works: a second, separate stack
docker run -d --name madar-padel -p 8092:80 -e ERPNEXT_UPSTREAM=http://padel-erpnext:8080 \
  --network padel_network madar-web:<version>
```

Each container's address (behind its own domain on the server) is that business's Madar. Users switch business by
opening the other address; "Your businesses" in Settings remembers the addresses on their device.

Health check: `GET /healthz`. The deployed version is served at `/version.txt`.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request into `development` and every push to it:

- **web** (Format, test, build): `npm run format:check`, unit tests, production build
- **docker**: builds the release image and smoke-tests it (health check, version, `config.json`, security headers, app routes)
- **android**: Capacitor sync and a debug APK build

The iOS simulator build uses macOS runners, so it only runs when started manually from the Actions tab with **ios** ticked; that run builds iOS only.

## Branches and releases

- `development` is the default branch.
- `development` is protected: changes arrive only through pull requests, which merge once CI passes and the branch is up to date.
- Releases are tagged `vX.Y.Z` (matching `package.json`), and each one produces a Docker image tagged with the same version.
