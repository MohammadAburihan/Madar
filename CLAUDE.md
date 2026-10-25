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
- Tests: Vitest via `ng test`. Every presenter gets a spec for its rendering and outputs. If tests behave as
  if a source change didn't happen, clear the stale cache: `rm -rf node_modules/.vitest-cache .angular/cache`.

## Commands

```sh
npm start             # dev server on http://localhost:4200, proxies /api and /files to ERPNext on :18080
                      # ERPNEXT_DEV_URL=http://localhost:18081 targets the seeded test site instead
npm test              # unit tests, single run
npm run build         # production build to dist/madar/browser
npm run cap:sync      # production build copied into the android/ and ios/ projects
npm run android:dev   # dev build on the Android emulator, talking to local ERPNext
npm run ios:dev       # dev build on the iOS simulator, talking to local ERPNext
npm run docker:build  # release image madar-web:<package.json version> for linux/arm64
npm run e2e           # Playwright happy paths (e2e/): own dev server on :4321 → seeded test site :18081; phone and desktop
```

Runtime config: `public/config.json` (`erpnextUrl`, empty = same origin). In the Docker image it is written at
container start from `MADAR_ERPNEXT_URL`. nginx proxies `/api`, `/files`, `/private/files` to
`ERPNEXT_UPSTREAM` (default `http://frontend:8080`, the frappe_docker service).

### Mobile

- Native apps have no proxy: when `erpnextUrl` is empty they use `environment.nativeErpnextUrl[platform]`.
  Dev builds point the Android emulator at `http://10.0.2.2:18080` and the iOS simulator at
  `http://localhost:18080`; production builds have none until the business-connection flow supplies it.
- Plain HTTP to a local ERPNext is allowed only in debug builds, never in release:
  Android via `android/app/src/debug/` (network security config for `10.0.2.2`/`localhost`), iOS via the
  "Allow local networking in Debug" build phase, which adds `NSAllowsLocalNetworking` to the built
  `Info.plist` for Debug only. There is a single `Info.plist`.
- Native versions follow `package.json`: Gradle reads it, and `cap:sync` runs `scripts/sync-ios-version.mjs`
  (versionCode / build number = major·1,000,000 + minor·1,000 + patch). Only plain `X.Y.Z` versions with
  minor and patch below 1000 are accepted, so build numbers never collide.
- `android:dev` runs `cap run android --no-sync` after its own dev sync; a second sync would replace the
  dev web build.
- Toolchain: Gradle needs Java 21 (`JAVA_HOME=$(/usr/libexec/java_home -v 21)`); Android Studio's bundled
  Java 25 fails with "Unsupported class file major version 69". `xcode-select` intentionally stays on
  CommandLineTools (used for other C++ work); don't change it. `npm run ios:dev` runs
  `scripts/ios-dev.sh`, which sets `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` itself; do the
  same for any direct `xcodebuild`/`xcrun simctl` command.
- Don't use `cap run ios`: its native-run dependency opens `Simulator.app`, which Xcode 27 replaced with
  DeviceHub, so deployment fails. `scripts/ios-dev.sh` builds with `xcodebuild` and launches via `simctl`.
- Nginx in the release image re-resolves `ERPNEXT_UPSTREAM` through `NGINX_RESOLVER` (the container's own
  DNS servers by default), so it starts before ERPNext and survives its restarts. The upstream must be
  `scheme://host[:port]` without a path (checked at start-up); nginx's resolver ignores search domains, so
  use fully qualified names outside Docker networks. `X-Forwarded-Proto` from a proxy in front is forwarded only with
  `TRUST_FORWARDED_PROTO=1` (set it behind the AWS load balancer). HTTPS upstreams get SNI. Every location that sets `add_header`
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

- Features must not import from other features; share through `shared/` or `core/` (customer lookup is
  `core/customers`, payment accounts `core/money`, task-page layout `shared/ui/task-page.scss`).
- Only `data-access/` talks to ERPNext. Containers go through the area facade, never `HttpClient` directly.
- Containers get language state and a translator from `injectI18n()` (`core/i18n/i18n.ts`); services that
  load something once share the in-flight call with `shareInFlight()` (`core/util/share-in-flight.ts`).
- The shell keeps a single `<router-outlet>` for all layouts; switching layout must not recreate the page.
- Multi-step tasks (Receive payment, Move stock) keep their state in a root store and are hosted by a parent
  flow route component whose constructor calls `store.resume()`. It is created only when the task is entered
  from elsewhere, so that is the "fresh visit": a half-done task starts over, while a running, unresolved, or
  not-yet-shown confirmation is kept. Moving between steps, including the back button, keeps the work.
- Containers turn data into display strings with a pure `*-view.ts` builder (see `home-view.ts`), so wording,
  plurals and formatting are unit-tested without rendering. Presenters receive plain strings.
- The Assistant (`features/assistant`) runs its read-only tools in the app with the user's own session; the `assistant/`
  service never reaches ERPNext. `assistant/src/tools.ts` and `TOOL_SCHEMAS` in `assistant-tools.ts` must stay the same
  (a spec compares them). `toolsFor` offers each role only the tools its capabilities allow, results stay under 4 KB.
- Assistant `propose_*` tools write nothing: they resolve names to ids (`AssistantProposalsService`) and the card's
  button hands the payload to `core/tasks/task-prefill.service.ts`, opening the task at `?prefill=<id>`. A task flow
  calls `injectPrefillEntry` (`core/tasks/prefill-entry.ts`) and its store's `openPrefill` re-looks everything up and
  fills a fresh task (busy keeps the open confirmation; failure leaves a fresh task plus a notice). The assistant
  feature never imports another feature's stores.

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
- Every change to a screen (a new screen, state or control, or a removed, moved or reworded one) is also made in
  `docs/Madar.pen` through the Pencil MCP tools, in English and Arabic, in the same PR, so the design stays the source
  of truth. Pencil edits reach disk only after the file is saved in Pencil: ask the user to save, then commit the
  `.pen`.

## ERPNext API notes

- Aggregates need dict syntax: `fields: [{ SUM: 'grand_total' }]`; SQL strings are rejected. `groupBy` works
  with them (e.g. receivables grouped by currency and rate). Sum `base_*` fields for company-currency totals.
- `ErpnextClient.list` defaults to 20 rows like Frappe; use `listAll` (pages of 500) when every row matters,
  and batch long `in` filters (see `stockFor`) to keep GET URLs short.
- "Today" is the site's wall-clock time (`SiteClockService`), not the device's.
- Child-table fields: `'items.qty as qty'` returns one row per child row.
- Non-admin users get an empty `roles` table on their own User doc; read `Has Role` with `parent: 'User'`.
- Guests get 403 (not `"Guest"`) from `frappe.auth.get_logged_user`. 403 also means "no permission", so
  after a 403 call `SessionService.checkExpired()` to tell the two apart.
- Default `Sales User` can't read Sales Invoices in v16; Home hides whatever a role can't read.
- Frappe HR v16 reads holiday lists from submitted `Holiday List Assignment`s, not the company default; attendance and
  leave fail without one. Approved leave marks "On Leave" attendance ahead for every day it covers.
  Advances need the company's Employee Advances account to be of type Receivable (ERPNext's chart leaves it untyped;
  set it per business site).
- `apply_price_list` takes `ctx`; give each item `parenttype: 'Sales Invoice'`, `uom`, `stock_uom` and
  `conversion_factor`, or ERPNext silently returns no price. Sales roles can't read Item Price directly.
- Frappe checks CSRF only when the session holds a `csrf_token`, which `/api/method/login` never sets (Desk
  does). Madar's writes therefore send no token; if Desk is ever served on Madar's origin, add the header.
- Writes are idempotent through a Madar reference (`SALE-…`, `COLL-…`; `newReference` in
  `core/erpnext/confirmation.ts`) in the document's `remarks` or the payment's `reference_no`. Purchase Order has
  no `remarks`, so its `PUR-…` reference goes in `order_confirmation_no`; Quotation, Sales Order and Delivery Note
  have none either, so theirs (`QUO-…`, …) go in the hidden `utm_content`. Run confirming
  requests through `confirmRequest`, which turns timeouts and 504s into `UnresolvedError`; then look the
  reference up instead of resubmitting, and submit the leftover draft if one exists.
- Stock counts and damage post as Stock Entries (Material Receipt or Issue) with `Count:`/`Lost:` … and the
  `CNT-`/`DMG-` reference in `remarks`; Stock Reconciliation has no field for either. Every Stock Entry links its
  type through `StockEntryTypesService` (by purpose): setup names the standard types in the site's language.
- Templates from `get_payment_entry` are new documents (`__islocal`, no name). Never spread one over an existing
  draft as-is: `frappe.client.submit` would insert a second document.
- Routed pages need the `ion-page` class, which forces a column flex layout; override per layout.
- Ionic caches pages: reset per-visit state (notices, password) instead of relying on a fresh component.

## Continuous integration

`.github/workflows/ci.yml` must stay green before merging: formatting, unit tests, production build, release image
smoke test, and an Android debug build. iOS is manual (`workflow_dispatch` with `ios`, which runs only the iOS job)
on a pinned `macos-26` image with Xcode 26.6, to save macOS minutes and avoid image drift.
Run the same checks locally before pushing: `npm run format:check` (or `npm run format` to fix) and `npm test`.
`.prettierignore` leaves out generated, native, docs, and Markdown files.

## Feature delivery

Each feature goes build → e2e → PR → `/code-review` → fix → merge; the `delivering-features` skill
(`.claude/skills/`) has the full loop. Every new or changed feature adds Playwright tests in `e2e/` for all its happy
paths (phone and desktop where it has both, Arabic for new screens) that check what the screen shows, and the whole
suite passes before merging. Reviews aim for confidence, not zero findings: stop reviewing and merge
(CI green) once a pass finds nothing above low severity, or two passes in a row find only low-severity items.
Run **at most 3 review passes** per PR: after the third, fix what it found that matters and merge, with no fourth
pass. Defer the rest to the PR description or `docs/STATUS.md`.

## Development and deployment model

- The frontend is developed locally on this machine in this repo.
- Each release produces a new Docker image of the web frontend that runs on an AWS server.
- ERPNext runs on the same AWS server as Docker containers (official Frappe/ERPNext Docker setup).
- Each business is a separate ERPNext installation (site). Never mix data across businesses.
- Decided (16 Oct 2026): each business gets its own Madar web address, with its own ERPNext backend and database
  running in its own containers on their own ports. One madar-web container serves one business; its
  `ERPNEXT_UPSTREAM` points at that business's ERPNext. Switching business means opening the other business's Madar
  address. "Your businesses" (`/businesses`) keeps the user's other addresses on the device, per origin.

### Local ERPNext

ERPNext for development runs in Docker on this machine from `../frappe_docker` (a clone of the official
frappe/frappe_docker repo), using its `pwd.yml` compose file:

```sh
cd ../frappe_docker && docker compose -f pwd.yml up -d
```

- `madar-erpnext:v16.50.0-hrms` (ERPNext v16.50.0 with Frappe HR, for Workers & HR), served at http://localhost:18080.
  The local `pwd.yml` publishes `18080:8080` (changed 20 Oct 2026: 8080 and 8081 are taken on this machine); inside
  Docker ERPNext still listens on 8080.
  Build it with `scripts/build-erpnext-image.sh` (apps pinned in `docker/erpnext/apps.json`); `pwd.yml` uses it in
  place of `frappe/erpnext`. A new site needs `--install-app hrms` as well as erpnext.
- Site `frontend`, login `Administrator` / `admin` (local only; never reuse on AWS).
- Stop with `docker compose -f pwd.yml down`. Don't add `-v` unless you mean to wipe the local data.
- After the ERPNext image changes, migrate each site (`docker compose -f pwd.yml exec backend bench --site <site>
  migrate`, after `bench --site <site> backup`). A site behind its code fails sign-in, sign-out and every request with
  a server error (16 Oct 2026: `Unknown column 'send_read_receipt'` on `frontend`, after Frappe 16.51).
- `pwd.yml` pins every request to the `frontend` site (`FRAPPE_SITE_NAME_HEADER`), whatever the Host header.
  Never write to `frontend` for testing: use `scripts/dev-test-site.sh`, which creates `madar-test.localhost`
  behind its own web container on port 18081 and seeds it (users in the README).

### Release rules

- `development` is the default branch and is protected: no direct or force pushes, even for admins. Every change
  goes through a PR from a feature branch, and merges need the "Format, test, build", "Release image", and
  "Android debug build" checks to pass on a branch that is up to date with `development`.
- Releases are git tags `vX.Y.Z`, matching `version` in `package.json`.
- The image tag matches the release version (`madar-web:X.Y.Z`). Deploy by explicit version, never only
  `latest`.
- Never rebuild or overwrite an existing version tag; a fix is a new version.
- Build images for the server's architecture: the AWS server is arm64 (Graviton), like this Mac, so release
  images are `linux/arm64` (`npm run docker:build`; CI's smoke test still builds amd64 on its runner).
- Keep environment-specific config (ERPNext URLs, keys, secrets) out of the image; supply it at container
  start. Never commit secrets.
- Frontend deploys must not touch ERPNext containers, volumes, or data.

### Production (AWS)

Decided 22 Oct 2026; first deploy 0.1.0 (tag `v0.1.0`).

- EC2 `i-03042dfbb1ba616cc` (t4g.medium, arm64, Ubuntu 26.04, `eu-north-1`), public IP 16.16.74.118, SSH
  `ubuntu@` with the key `../../ERPNext/ERPNext.pem`. Images live in ECR `717090908140.dkr.ecr.eu-north-1.amazonaws.com`
  (`madar-web`, `madar-erpnext`; tags immutable).
- ERPNext is one shared multi-site bench in `~/erpnext` (`docker-compose.yml` + `.env`; `ERPNEXT_IMAGE` and
  `ERPNEXT_VERSION` pick the image, now `madar-erpnext:v16.50.0-hrms`), serving `erp.aburehan.net`,
  `issam.aburehan.net` and `rehannursery.aburehan.net` on 127.0.0.1:8080, sites chosen by Host header. Frappe HR is
  installed on `rehannursery` only. This differs from "one ERPNext stack per business" above: the bench predates
  Madar.
- Madar for Rehan Nursery is the container `madar-rehannursery` (`madar-web:<version>`, network
  `erpnext_default`, 127.0.0.1:8090, `ERPNEXT_UPSTREAM=http://frontend:8080`,
  `ERPNEXT_SITE_HOST=rehannursery.aburehan.net`, `TRUST_FORWARDED_PROTO=1`). Host nginx
  (`/etc/nginx/sites-available/madar-rehannursery`, Let's Encrypt via certbot) serves `rehannursery.aburehan.net` →
  Madar and `desk.rehannursery.aburehan.net` → Desk (Host pinned to the site).
- A new image reaches the server with `docker save … | gzip` → rsync to `~` (not `/tmp`, a 1.9 GB tmpfs) →
  `docker load`, until the instance role can pull from ECR. Deploy = `docker rm -f` + `docker run` the container
  with the new tag. Before an ERPNext image change: `bench backup --with-files` per site, an EBS snapshot, then
  `bench --site <site> migrate` for every site. The sites volume keeps its own `sites/apps.txt`: add a new app there
  before `install-app`.
- The assistant is the container `madar-assistant-rehannursery` (`madar-assistant:<version>` from `assistant/`, network
  `erpnext_default`; madar-web reaches it through `ASSISTANT_UPSTREAM`). The Anthropic API key lives only in
  `~/madar-assistant.env` (mode 600) on the server, never in git or an image. With `TRUST_FORWARDED_PROTO=1` the per-IP limit on `/assistant/` keys on the last
  `X-Forwarded-For` hop: the proxy directly in front (host nginx) must append the client address; with another layer
  (an ALB) in front of it, set real IPs there first.
- Android release: `npm run cap:sync`, then `JAVA_HOME=$(/usr/libexec/java_home -v 21)
  ANDROID_HOME=~/Library/Android/sdk ./gradlew bundleRelease` in `android/`; signing reads the git-ignored
  `android/keystore.properties` (key and a copy of the properties in `../secrets/`, outside git).

## Roles and permissions

`docs/PERMISSIONS.md` is the approved role matrix. `personaFor` (`core/auth/persona.ts`) maps ERPNext roles to a
Madar role and `capabilitiesFor` (`core/auth/capabilities.ts`) holds the finer rules ERPNext can't express
(discount cap, price edits, payment accounts). Change the doc first, then the code.

## Implementation boundaries

- Use supported ERPNext/Frappe APIs; keep business rules, stock valuation, and accounting on the backend.
- Add custom backend methods only where a simplified workflow needs them.
- Full English and Arabic (RTL) parity, including errors and accessibility labels.
- Online-first; offline transactions are out of scope for release 1.

## Not decided yet

Authentication beyond ERPNext's own login, and deployment automation (CD; CI is in place). Decided 22 Oct 2026:
ERPNext v16.50 + Frappe HR in production, Amazon ECR, the EC2 server above, and the apps connect by asking for the
business's Madar address on first launch (TestFlight and Play internal testing first). Ask before choosing any of these; don't assume. See section 12 of the overview.
