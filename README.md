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
docs/       product brief, design handoff, and the Madar.pen design file
CLAUDE.md   conventions for AI-assisted development
```

The Angular app has not been scaffolded yet.

## Local development

### ERPNext backend

ERPNext runs in Docker from a sibling clone of [frappe_docker](https://github.com/frappe/frappe_docker):

```sh
cd ../frappe_docker
docker compose -f pwd.yml up -d
```

Open http://localhost:8080 and sign in as `Administrator` / `admin` (local development only).

Stop it with `docker compose -f pwd.yml down`. Adding `-v` deletes the local data.

## Branches and releases

- `development` is the default branch.
- Releases are tagged `vX.Y.Z`, and each one produces a Docker image tagged with the same version.
