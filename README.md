# Waypoint Group

> Modular Monolith API, Machine Learning Inference Service, and Offline-First React PWA with Four Operational Role Shells.

[![Go](https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat&logo=go)](https://golang.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?style=flat&logo=pwa)](https://web.dev/progressive-web-apps/)

---

## 📁 Repository Structure

```text
├─ apps/
│  ├─ api/            Go modular monolith
│  ├─ ml/             FastAPI inference service
│  └─ web/            ONE Vite React + TS PWA, four role shells
├─ packages/
│  ├─ api-client/     generated from contracts/openapi.yaml
│  ├─ domain/         shared types, zod schemas, sync event types, Asia/Colombo time utils
│  ├─ sync-core/      outbox + pull logic (IndexedDB adapter only now)
│  ├─ i18n/           en / si / ta JSON
│  └─ design-tokens/
├─ contracts/openapi.yaml
├─ db/  docs/  docker-compose.yml  .env.example  Caddyfile  README.md
```

---

## 🚀 Key Architectural Components

### 1. `apps/api` (Go Modular Monolith)
- Built with idiomatic Go standard library HTTP routing (`net/http` pattern matching).
- Clear modular boundaries:
  - `auth`: Authentication and role-based session resolution.
  - `waypoint`: Operational mission and stop management.
  - `sync`: Batch outbox ingestion and delta cursor tracking.
  - `ml`: Upstream proxy and fallback distance/travel calculations.
- Graceful shutdown, structured JSON logging, and CORS middleware.

### 2. `apps/ml` (FastAPI Inference Service)
- High-performance Python inference microservice.
- Endpoints:
  - `POST /api/v1/predict/eta`: Calculates travel duration, distance, and arrival estimates.
  - `POST /api/v1/predict/optimize-route`: Solves multi-stop waypoint ordering using nearest-neighbor heuristics.
  - `GET /health`: Health and diagnostics probe.

### 3. `apps/web` (ONE Vite React + TS PWA, 4 Role Shells)
Single progressive web application that adapts seamlessly to four operational roles:
- **Admin Shell**: Fleet metrics, system health, and user directory.
- **Dispatcher Shell**: Real-time mission control, task dispatching, and ML route optimization.
- **Field Agent Shell**: Mobile-first field inspection view, observation logger, and 100% offline capability.
- **Driver Shell**: High-contrast turn-by-turn cockpit, GPS navigation links, and one-touch arrival/delivery actions.

### 4. `packages/` (Shared Workspace Packages)
- **`@waypoint/api-client`**: Strongly-typed client and types generated from `contracts/openapi.yaml`.
- **`@waypoint/domain`**: Shared TypeScript types, Zod schemas, sync event models, and Sri Lanka (`Asia/Colombo`, UTC+05:30) time utilities.
- **`@waypoint/sync-core`**: Offline-first mutation queuing, IndexedDB persistence adapter, outbox flush logic, and delta pull engine.
- **`@waypoint/i18n`**: Trilingual support with typed dictionaries in English (`en`), Sinhala (`si`), and Tamil (`ta`).
- **`@waypoint/design-tokens`**: Standardized color palette, role shell accents, spacing, and CSS custom properties.

---

## ⚡ Quickstart

### Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose
- [Node.js](https://nodejs.org/) (v20+) & [pnpm](https://pnpm.io/) (`pnpm@11.6+`)
- [Go](https://go.dev/) (1.23+)
- [Python](https://python.org/) (3.9+)

### 1. Run Everything with Docker Compose

```bash
# Copy example environment configuration
cp .env.example .env

# Spin up Caddy, Go API, FastAPI ML, React Web, and PostgreSQL
docker compose up --build -d

# View service logs
docker compose logs -f
```

Access the services:
- **Web PWA & Unified Edge**: [http://localhost](http://localhost) (or port 80/3000)
- **Go API**: [http://localhost:8080/api/v1/health](http://localhost:8080/api/v1/health)
- **FastAPI ML Service**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **PostgreSQL**: `localhost:5432` (`waypoint_db` / user: `postgres`)

---

### 2. Local Development Without Docker

#### Install Workspace Dependencies
```bash
pnpm install
```

#### Run the Services Individually
```bash
# Terminal 1: Run Go Modular Monolith API
cd apps/api
go run cmd/server/main.go

# Terminal 2: Run FastAPI ML Service
cd apps/ml
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 3: Run Vite React PWA
pnpm dev:web
```

---

## 🛠️ Offline Sync Protocol

The platform implements an offline-first architecture powered by `@waypoint/sync-core`:
1. **IndexedDB Local Storage**: All modifications (e.g. status changes, field observations) are stored immediately in local IndexedDB.
2. **Outbox Queue**: Changes are logged in the `outbox` store with unique UUIDs.
3. **Automatic Reconnection Flush**: When `navigator.onLine` triggers, pending outbox items are automatically sent in batch to `POST /api/v1/sync/push`.
4. **Delta Pull**: Clients fetch changes since their last cursor via `GET /api/v1/sync/pull`.

---

## 🇱🇰 Timezone & Localization
- **Timezone**: Sri Lanka Standard Time (`Asia/Colombo`, UTC+05:30) is the default operational timezone across all services and PWA headers.
- **Languages**: Full translation coverage in English (`en`), Sinhala (`si`), and Tamil (`ta`).

---

## 📖 Documentation
- [Architecture Overview](docs/architecture.md)
- [Offline Sync Protocol](docs/sync-protocol.md)
- [Operational Role Shells](docs/roles.md)
- [Database Schema & Migrations](db/README.md)
- [OpenAPI Specification](contracts/openapi.yaml)
