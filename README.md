# Waypoint Delivery Platform: Backend & Core Services

> Production-grade Go modular monolith, Python FastAPI ML inference service, single PostgreSQL 16 datastore, and Caddy 2 reverse proxy built strictly contract-first from `contracts/openapi.yaml`.

[![Go](https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat&logo=go)](https://golang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![Caddy](https://img.shields.io/badge/Caddy-2-22B573?style=flat&logo=caddy)](https://caddyserver.com)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.3-6BA539?style=flat&logo=openapiinitiative)](contracts/openapi.yaml)
[![Tests](https://img.shields.io/badge/Tests-Passing-success)](apps/api)

---

## 1. Quickstart

### Run Everything with Docker Compose

```bash
# 1. Spin up Postgres 16, Go API Monolith, Python ML Service, React Web PWA, and Caddy Edge Proxy
docker compose up --build -d

# 2. Verify all services are healthy
docker compose ps

# 3. Check health and ready probes
curl -s http://localhost:8080/healthz | jq
curl -s http://localhost:8080/readyz | jq
```

- **Web Application**: [http://localhost](http://localhost) (or port 80/3000)
- **API Base URL**: `http://localhost/api/v1` (or direct: `http://localhost:8080/api/v1`)
- **ML Service**: `http://localhost/ml/healthz` (or direct: `http://localhost:8000/healthz`)
- **Database**: `localhost:5432` (database: `waypoint_db`, user: `postgres`, password: `postgres`)

---

## 2. Pre-Seeded Demo Accounts

The database seeds automatically on boot with the authoritative reference dataset (120 outlets, 60 vehicles, October 2026 operating calendar) and verified demo accounts:

| Role | Email | Password | PIN | Context / Assignment |
|---|---|---|---|---|
| **Central Dispatcher** | `dispatcher@waypoint.local` | `pass1234` | — | Peliyagoda & Network-wide Dispatch |
| **Dock Loader** | `loader.peliyagoda@waypoint.local` | `pass1234` | `1234` | Peliyagoda Depot Loading Dock |
| **Driver** | `driver.001@waypoint.local` | `pass1234` | `1234` | Lead Reefer Truck `VEH-001` |
| **Store Manager** | `store.fresh001@waypoint.local` | `pass1234` | — | Outlet `OUT-FRESH-001` (Colombo) |
| **Store Manager (Deferred)** | `store.deferred@waypoint.local` | `pass1234` | — | Deferred Outlet (Fairness Test) |

---

## 3. End-to-End Walkthrough (Judge Evaluation Flow)

Follow this 5-step walkthrough to test the end-to-end operational lifecycle:

```
[1. Store Places Order] -> [2. Dispatcher Closes & Plans] -> [3. Loader Scans & Seals] -> [4. Driver Delivers Offline] -> [5. Store Confirms PoD]
```

### Step 1: Store Manager Places Order
1. Login as `store.fresh001@waypoint.local` (`pass1234`).
2. Submit a mixed basket of ambient goods and chilled dairy/produce for `2026-10-05`.
3. Notice: The backend ordering engine splits Fresh multi-temperature baskets into linked ambient and chilled orders, computing server-side line weights, volumes, and 6-digit PoD verification codes.

### Step 2: Dispatcher Cutoff & Algorithmic Planning
1. Login as `dispatcher@waypoint.local` (`pass1234`).
2. Trigger 16:00 cutoff closing: `POST /api/v1/dispatch/close-orders`.
3. Click **Generate Plan** for Peliyagoda on `2026-10-05` using `fairness_first` strategy:
   - Evaluates multi-trip scheduling (Trip 1 departs 03:30, Trip 2 departs 07:00).
   - Enforces vehicle temperature matching (reefer vs ambient), access constraints (van-only outlets), mall delivery windows, and exact trip time/fuel budgets.
   - Any unserved orders produce explainable deferral traces (`POST /api/v1/dispatch/explain/{id}`).
4. Validate and click **Publish Plan** (`POST /api/v1/plans/{id}/publish`).

### Step 3: Dock Loader Pre-Departure Verification
1. Login as `loader.peliyagoda@waypoint.local` (PIN `1234`).
2. Open Trip 1 for vehicle `VEH-001`.
3. View the reverse-loading sequence manifest (`GET /api/v1/loader/trips/{id}/manifest`): last drop stop is loaded first at the front of the truck bed.
4. Record loading item checks (`POST /api/v1/loader/trips/{id}/checks`).
5. Seal the trip (`POST /api/v1/loader/trips/{id}/seal`).

### Step 4: Driver Offline Execution & Event Sync
1. Login as `driver.001@waypoint.local` (PIN `1234`).
2. Download daily run snapshot (`GET /api/v1/driver/run`). All route, window, and recipient data is cached locally for 100% offline hill-country execution.
3. Simulate offline actions (Arrived, Delivered with Proof-of-Delivery, Issue Reported).
4. Reconnect and sync batch (`POST /api/v1/sync/push`):
   - Server processes events with atomic savepoints.
   - Outbox emits domain events; dispatcher dashboard updates live via Server-Sent Events (`GET /api/v1/events/stream`).

### Step 5: Store Manager Delivery Confirmation
1. Store manager receives arrival notice and verifies the 6-digit offline receipt code (`482910`).
2. Store manager confirms delivery (`POST /api/v1/orders/{id}/confirm-receipt`).

---

## 4. Demo State Controls

For hackathon demonstrations, the backend includes deterministic demo controls:

### Reset Database to Initial Seed State
```bash
curl -X POST http://localhost:8080/api/v1/admin/demo/reset \
  -H "Authorization: Bearer <ADMIN_OR_DISPATCHER_TOKEN>"
```

### Advance Simulated Business Time
```bash
# Advance demo clock by 60 minutes
curl -X POST http://localhost:8080/api/v1/admin/demo/advance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"minutes": 60}'

# Set demo clock to exact time
curl -X POST http://localhost:8080/api/v1/admin/demo/clock \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"simulated_now": "2026-10-05T16:00:00+05:30"}'
```

---

## 5. Architectural Decisions (ADR Summary)

Detailed Architecture Decision Records are documented in [`docs/adr/`](docs/adr/):
- **[ADR-001](docs/adr/ADR-001-modular-monolith.md)**: Modular monolith in Go (single deployable, strict module isolation, no microservices overhead).
- **[ADR-002](docs/adr/ADR-002-postgres-sole-datastore.md)**: PostgreSQL 16 as the single datastore (handles relational data, transactional outbox via `FOR UPDATE SKIP LOCKED`, event feed, and idempotency store without Redis).
- **[ADR-003](docs/adr/ADR-003-openapi-contract-first.md)**: Contract-first design using OpenAPI 3.0.3 and `oapi-codegen` strict server.
- **[ADR-004](docs/adr/ADR-004-sync-commands-async-effects.md)**: Synchronous HTTP commands for human wait-times, transactional outbox for async background tasks, and circuit-breaker protected ML inference.
- **[ADR-005](docs/adr/ADR-005-sse-over-websockets.md)**: Server-Sent Events (SSE) for one-way realtime updates with `Last-Event-ID` auto-recovery.
- **[ADR-006](docs/adr/ADR-006-append-only-sync-facts.md)**: Offline driver facts are append-only events with client UUIDs applied idempotently.
- **[ADR-007](docs/adr/ADR-007-colombo-timezone-utc-storage.md)**: Business logic in `Asia/Colombo` (+05:30) with embedded `tzdata`, database storage in UTC `timestamptz`.
- **[ADR-008](docs/adr/ADR-008-integer-arithmetic-for-physical-quantities.md)**: Integer arithmetic for physical capacities (grams, microlitres, millilitres fuel).

---

## 6. Testing & Quality Verification

Run all test suites locally:

```bash
cd apps/api

# Run unit and property tests (including Golden Tests A & B and 100 rapid property tests)
go test -v ./...

# Run static analysis (0 warnings / 0 errors required)
golangci-lint run ./...

# Run Go vet
go vet ./...
```

---

## 7. AI Transparency & Attribution

In full compliance with competition rules, all AI usage, human architectural decisions, and verification steps are logged in [`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md).
