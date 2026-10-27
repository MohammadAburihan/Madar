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

### Setup app (madar_setup)

`erpnext-app/madar_setup/` is a small Frappe app whose patches add data to one business's ERPNext site on
`bench migrate`; the first adds Rehan Nursery's items and selling prices. Build the image that carries it with
`scripts/build-erpnext-setup-image.sh` (`madar-erpnext:v16.50.0-hrms-setup-0.1.0`), then install it only on the site
that needs it (`bench --site <site> install-app madar_setup`). See CLAUDE.md for the full steps.

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
npm run docker:build   # builds madar-web:<version> for linux/arm64 (the AWS server)
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
| `MADAR_DESK_URL` | empty | ERPNext Desk address for this business, shown to the Owner in Settings → Open ERPNext; empty hides it |
| `ASSISTANT_UPSTREAM` | empty | madar-assistant address nginx proxies `/assistant/` to, limited to 30 requests per minute per client (burst 10); empty answers 404 |

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

## Assistant service

`assistant/` is `madar-assistant`, a small Node 24 service that relays the in-app assistant chat to Claude Haiku 5.5, so
the Anthropic API key never reaches the client. Every request needs the user's ERPNext session cookie (forwarded by
madar-web's nginx); the service checks it with ERPNext. It is not part of the Angular build.

```sh
cd assistant && npm ci
ANTHROPIC_API_KEY=… ERPNEXT_UPSTREAM=http://localhost:18081 ERPNEXT_SITE_HOST=madar-test.localhost npm run dev
npm test && npm run build
```

API: `POST /assistant/chat` with `{ language, context: { business, currency, today, persona }, tools, messages }`
answers with Server-Sent Events: `text` deltas, then one `message` (`content`, `stop_reason`) or an `error`
(`{ code }`: `refusal`, `rate_limited`, `busy`, `unavailable`, `bad_request`, `unauthorized`). Requests refused before the
stream starts (sign-in, validation, limits) get the same `{ code }` as JSON with status 401, 403, 400, 413, 429 or 503
(`unavailable`: ERPNext could not be reached to check the session). 429 always carries `Retry-After`: 2 s for `busy`,
60 s for the per-minute rate, and the seconds to UTC midnight for a spent daily budget (both `rate_limited`).
`GET /assistant/healthz` answers 200 `ok` once the start-up self-check has passed, 200 `starting` while it runs, and 503
`{ "code": "self_check_failed", "message" }` after it failed (the container then reports unhealthy while the service keeps
answering).

Self-check: on start the service sends Claude one minimal request (`max_tokens: 1`, "ping", effort low) with the full
tool registry and the real system prompt, logs `self-check ok` or `self-check failed: <status> <message>`, and retries
every 10 minutes while it fails. It catches what only the API reports, such as a tool schema it refuses. Set
`ASSISTANT_SELF_CHECK=0` to skip it (tests, CI, runs without a real key); `healthz` then answers `ok` straight away.
API errors from Claude are logged with their status, type and message, never request content, cookies or headers.

Adding a tool: tools are not strict (Anthropic's strict grammar limits optional and union-typed parameters across all tools in a
request), so inputs are validated in the app (`assistant-tools.ts`). Keep `TOOL_SCHEMAS` and `assistant/src/tools.ts` in sync.

Voice and privacy: the microphone button in the assistant fills the message field; nothing is sent until the user presses
Send. Speech is turned into text on the user's device or by their browser, never by Madar: in a browser the recognition may
send the audio to the browser vendor (Google for Chrome, Apple for Safari); the iOS and Android apps use the phone's own
recognizer (Apple's, or Google's or the device's). Madar's server never receives audio, only the text the user sends.
Replies are read aloud with the browser's or phone's voices; nothing is sent anywhere for that.

Caching: an explicit breakpoint on the stable system block caches the tools and system prompt together (tools render
first, so they carry no marker of their own), and top-level automatic caching moves a second breakpoint to the end of the
growing conversation. The per-request context block sits after the breakpoint so it never breaks the prefix, and
messages are rebuilt byte-for-byte the same on every request. Haiku 5.5 caches nothing below 512 tokens; check
`cache_read` and `cache_write` in the logs to confirm hits.

Clients must send `Content-Type: application/json` and the header `X-Madar-Assistant: 1` on every chat request (the
service answers 403 `forbidden` otherwise, which keeps cross-site form posts out). An `Origin` header, when present,
must have the same host and port as the request's `Host` header (the scheme is ignored, because TLS ends at a proxy), or be `capacitor://localhost`, `http://localhost` or `https://localhost`. Only
ERPNext desk users (a role with desk access) are accepted. One request per user can run at a time (a second gets 429
`busy`), and bodies are capped at 64 KB, 60 messages and 60,000 characters. Messages may hold only `text`,
`tool_result`, `thinking`, `redacted_thinking` and `tool_use` blocks; every `tool_use` must name a tool that is both
known to the service and listed in the request's `tools`. Tools are not strict and the service does not
check what the model returns: clients must validate tool inputs before acting on them.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Anthropic API key |
| `ERPNEXT_SITE_HOST` | required | Host header sent to ERPNext when checking the session |
| `ERPNEXT_UPSTREAM` | `http://frontend:8080` | ERPNext address |
| `PORT` | `8080` | Listen port |
| `ASSISTANT_MODEL` | `claude-haiku-5-5` | Model id |
| `ASSISTANT_RATE_PER_MIN` | `20` | Requests per user per minute |
| `ASSISTANT_DAILY_TOKENS` | `400000` | Billed tokens per user per UTC day: input + cache writes + cache reads at 0.1 + output |
| `ASSISTANT_GLOBAL_DAILY_TOKENS` | `3000000` | The same count across all users |

On the server, run it beside madar-web on the ERPNext network, with the key in an env file (mode 600, never in git):

```sh
docker buildx build --platform linux/arm64 -t madar-assistant:<version> --load assistant
docker run -d --name madar-assistant-rehannursery --network erpnext_default \
  --env-file ~/madar-assistant.env madar-assistant:<version>
# madar-web: add -e ASSISTANT_UPSTREAM=http://madar-assistant-rehannursery:8080
```

madar-web's nginx limits `/assistant/` per client address. With `TRUST_FORWARDED_PROTO=1` it keys on the last
`X-Forwarded-For` hop, so the proxy directly in front (host nginx) must be the one that appends the client address.
With another proxy layer (for example an ALB) in front of it, set real client IPs there first.

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
