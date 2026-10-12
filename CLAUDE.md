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

## Development and deployment model

- The frontend is developed locally on this machine in this repo.
- Each release produces a new Docker image of the web frontend that runs on an AWS server.
- ERPNext runs on the same AWS server as Docker containers (official Frappe/ERPNext Docker setup).
- Each business is a separate ERPNext installation (site). Never mix data across businesses.

### Release rules

- `development` is the default branch. Releases are git tags `vX.Y.Z`.
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

Frontend framework, ERPNext version, authentication, container registry, AWS server and domain setup,
local ERPNext setup for development, and CI/CD. Ask before choosing any of these; don't assume. See
section 12 of the overview.
