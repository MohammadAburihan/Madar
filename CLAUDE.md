# Madar — مدار

Madar is a simple business-management frontend (web, Android, iOS) on top of ERPNext. ERPNext owns
business records, stock, accounting, validation, and permissions; Madar provides task-focused screens.

## Source documents

All in `docs/`:

- `Madar_Project_Overview.md` — product brief and release 1 scope. This is the baseline; anything outside it
  is a scope change and must be raised before building.
- `DESIGN-HANDOFF.md`, `INTERACTION-CONTRACT.md`, `LOCALIZATION-GLOSSARY.md`, `ACCESSIBILITY-AUDIT.md`,
  `COMPLETION-MATRIX.md`, `interaction-routes.json`, `design-previews/` — design handoff material.
- `Madar.pen` — the design file. It is encrypted: read it only through the Pencil MCP tools, never with
  file reads or grep.

## Frontend stack

- Angular 22 (TypeScript, strict mode): standalone components, signals, `input()`/`output()`, new control
  flow (`@if`, `@for`). No NgModules.
- Capacitor 8 wraps the same app for Android and iOS; Ionic 9 for Angular for mobile-style UI.
  In Ionic 9 standalone components come from `@ionic/angular` (there is no `@ionic/angular/standalone`).
- Typed reactive forms; `HttpClient` with interceptors for auth and the active business.
- Runtime English/Arabic switching (Transloco) with full RTL. Use CSS logical properties (`margin-inline-start`,
  not `margin-left`) so layouts flip correctly. Translations live in `public/i18n/{en,ar}.json`; Arabic terms
  must follow `docs/LOCALIZATION-GLOSSARY.md`.
- Tests: Vitest via `ng test`. Every presenter gets a spec for its rendering and outputs.

## Commands

```sh
npm start             # dev server on http://localhost:4200, proxies /api and /files to ERPNext on :8080
                      # ERPNEXT_DEV_URL=http://localhost:8081 targets the seeded test site instead
npm test              # unit tests, single run
npm run build         # production build to dist/madar/browser
npm run cap:sync      # production build copied into the android/ and ios/ projects
npm run android:dev   # dev build on the Android emulator, talking to local ERPNext
npm run ios:dev       # dev build on the iOS simulator, talking to local ERPNext
npm run docker:build  # release image madar-web:<package.json version> for linux/amd64
```

Runtime config: `public/config.json` (`erpnextUrl`, empty = same origin). In the Docker image it is written at
container start from `MADAR_ERPNEXT_URL`. nginx proxies `/api`, `/files`, `/private/files` to
`ERPNEXT_UPSTREAM` (default `http://frontend:8080`, the frappe_docker service).

### Mobile

- Native apps have no proxy: when `erpnextUrl` is empty they use `environment.nativeErpnextUrl[platform]`.
  Dev builds point the Android emulator at `http://10.0.2.2:8080` and the iOS simulator at
  `http://localhost:8080`; production builds have none until the business-connection flow supplies it.
- Plain HTTP to a local ERPNext is allowed only in debug builds, never in release:
  Android via `android/app/src/debug/` (network security config for `10.0.2.2`/`localhost`), iOS via
  `App/Info-Debug.plist` (`NSAllowsLocalNetworking`, used by the Debug configuration only). Keep
  `Info-Debug.plist` identical to `Info.plist` apart from that key.
- `android:dev` runs `cap run android --no-sync` after its own dev sync; a second sync would replace the
  dev web build.
- Toolchain: Gradle needs Java 21 (`JAVA_HOME=$(/usr/libexec/java_home -v 21)`); Android Studio's bundled
  Java 25 fails with "Unsupported class file major version 69". `xcode-select` intentionally stays on
  CommandLineTools (used for other C++ work); don't change it. `npm run ios:dev` runs
  `scripts/ios-dev.sh`, which sets `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` itself; do the
  same for any direct `xcodebuild`/`xcrun simctl` command.
- Don't use `cap run ios`: its native-run dependency opens `Simulator.app`, which Xcode 27 replaced with
  DeviceHub, so deployment fails. `scripts/ios-dev.sh` builds with `xcodebuild` and launches via `simctl`.
- Nginx in the release image re-resolves `ERPNEXT_UPSTREAM` through `NGINX_RESOLVER` (Docker's DNS by
  default), so it starts before ERPNext and survives its restarts. Every location that sets `add_header`
  must `include` `docker/security-headers.conf`, or nginx drops the security headers there.
- `CapacitorHttp` is enabled, so `HttpClient` requests go through native networking (no CORS in the apps).
- `core/platform/native-shell.service.ts` owns status bar, splash hide, and the Android back button.
- Icons and splash screens are generated from `assets/` with `npx capacitor-assets generate`. The current
  artwork is a placeholder.

## Architecture: container/presenter

Every screen is split into a container and presenters.

**Containers** (`*.container.ts`, routed pages and feature shells)
- Inject facades/services, load and mutate data, own screen state (signals), handle navigation.
- Pass data to presenters via inputs and handle their outputs.
- Keep templates thin: compose presenters, avoid layout and styling detail.

**Presenters** (`*.component.ts`)
- `ChangeDetectionStrategy.OnPush`, only `input()` / `output()` / `model()`.
- Never inject data services, `HttpClient`, `Router`, or stores; no side effects. Translation pipes and
  pure UI helpers are fine.
- Emit intent (`save`, `selectCustomer`), not implementation (`callApi`).
- Local UI-only state (expanded panel, active tab) may live in the presenter.

**Layout**

```
src/app/
  core/            auth, active business connection, HTTP interceptors, runtime config, ERPNext client
  shared/ui/       reusable presenters (selectors, money display, status badges, empty/error states)
  features/<area>/ sales, purchasing, inventory, contacts, payments, projects, items
    containers/    routed containers
    components/    presenters for this area
    data-access/   facade + API services and models for the area's ERPNext doctypes
```

- Features must not import from other features; share through `shared/` or `core/`.
- Only `data-access/` talks to ERPNext. Containers go through the area facade, never `HttpClient` directly.
- Containers turn data into display strings with a pure `*-view.ts` builder (see `home-view.ts`), so wording,
  plurals and formatting are unit-tested without rendering. Presenters receive plain strings.

## Design fidelity

- `docs/Madar.pen` is the source of truth. Read frames and tokens through the Pencil MCP tools
  (`Get`, `GetVariables`, `Export` for PNGs) and match labels, spacing, and tokens exactly.
- Tokens live as CSS variables in `src/styles.scss` (`--md-primary`, `--md-ink`, …), mirroring the `.pen`
  variables. Icons are Lucide (`@lucide/angular`), as in the design.
- Pencil strokes sit inside the box: a 48px button with a 1px border uses 11px vertical padding.
- Arabic mocks start-align button labels and use line-height 1.5 (`--md-lh`); amounts stay a left-aligned
  LTR run. Pencil can't do bidi, so mocks show some Arabic strings in LTR order — trust the browser's bidi.
- Breakpoints: mobile < 768px (bottom nav), tablet 768–1279px (80px rail), desktop ≥ 1280px (232px sidebar).
- Verify against exported mock PNGs at 390/1024/1440px in both languages before calling UI work done.

## ERPNext API notes

- Aggregates need dict syntax: `fields: [{ SUM: 'grand_total' }]`; SQL strings are rejected.
- Child-table fields: `'items.qty as qty'` returns one row per child row.
- Non-admin users get an empty `roles` table on their own User doc; read `Has Role` with `parent: 'User'`.
- Guests get 403 (not `"Guest"`) from `frappe.auth.get_logged_user`. 403 also means "no permission", so
  after a 403 call `SessionService.checkExpired()` to tell the two apart.
- Default `Sales User` can't read Sales Invoices in v16; Home hides whatever a role can't read.
- Routed pages need the `ion-page` class, which forces a column flex layout; override per layout.
- Ionic caches pages: reset per-visit state (notices, password) instead of relying on a fresh component.

## Development and deployment model

- The frontend is developed locally on this machine in this repo.
- Each release produces a new Docker image of the web frontend that runs on an AWS server.
- ERPNext runs on the same AWS server as Docker containers (official Frappe/ERPNext Docker setup).
- Each business is a separate ERPNext installation (site). Never mix data across businesses.

### Local ERPNext

ERPNext for development runs in Docker on this machine from `../frappe_docker` (a clone of the official
frappe/frappe_docker repo), using its `pwd.yml` compose file:

```sh
cd ../frappe_docker && docker compose -f pwd.yml up -d
```

- `frappe/erpnext:v16.50.0`, served at http://localhost:8080.
- Site `frontend`, login `Administrator` / `admin` (local only; never reuse on AWS).
- Stop with `docker compose -f pwd.yml down`. Don't add `-v` unless you mean to wipe the local data.
- `pwd.yml` pins every request to the `frontend` site (`FRAPPE_SITE_NAME_HEADER`), whatever the Host header.
  Never write to `frontend` for testing: use `scripts/dev-test-site.sh`, which creates `madar-test.localhost`
  behind its own web container on port 8081 and seeds it (users in the README).

### Release rules

- `development` is the default branch. Work happens on feature branches merged through PRs.
- Releases are git tags `vX.Y.Z`, matching `version` in `package.json`.
- The image tag matches the release version (`madar-web:X.Y.Z`). Deploy by explicit version, never only
  `latest`.
- Never rebuild or overwrite an existing version tag; a fix is a new version.
- Build images for the server's architecture: this Mac is Apple Silicon (arm64) and the AWS server is likely
  x86_64, so use `docker buildx build --platform linux/amd64` unless the server is arm64.
- Keep environment-specific config (ERPNext URLs, keys, secrets) out of the image; supply it at container
  start. Never commit secrets.
- Frontend deploys must not touch ERPNext containers, volumes, or data.

## Implementation boundaries

- Use supported ERPNext/Frappe APIs; keep business rules, stock valuation, and accounting on the backend.
- Add custom backend methods only where a simplified workflow needs them.
- Full English and Arabic (RTL) parity, including errors and accessibility labels.
- Online-first; offline transactions are out of scope for release 1.

## Not decided yet

ERPNext version for production, authentication, container registry, AWS server and domain setup, and
CI/CD. Ask before choosing any of these; don't assume. See section 12 of the overview.
