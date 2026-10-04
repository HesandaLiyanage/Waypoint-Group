# Waypoint Delivery Platform: Backend & Core Services

> Production-grade Go modular monolith, Python FastAPI ML inference service, single PostgreSQL 16 datastore, and Caddy 2 reverse proxy built strictly contract-first from `contracts/openapi.yaml`.

[![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=flat&logo=go)](https://golang.org)
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
curl -s http://localhost/api/v1/healthz
curl -s http://localhost/api/v1/readyz
```

- **Web Application**: [http://localhost](http://localhost) (through the Caddy proxy; `.env.example` lists every setting, and the defaults work without a `.env` file)
- **API Base URL**: `http://localhost/api/v1`
- **ML Service**: `http://localhost/ml/healthz`
- **Database**: `127.0.0.1:5432` (database: `waypoint_db`, user: `postgres`, password: `postgres`; reachable from the host only)

Set real values for `JWT_SECRET`, `POSTGRES_PASSWORD` and `BOOTSTRAP_PASSWORD` before exposing this publicly, and serve it over HTTPS.

---

## 2. Pre-Seeded Demo Accounts

On boot the API loads the official challenge master data (120 outlets, 60 vehicles, 910 calendar days, 2024-01-01 to 2026-06-28) and refuses to start if the counts or IDs do not match. The business clock starts at `BUSINESS_NOW` (default 2026-06-21 15:00 Colombo, one hour before the 16:00 cutoff for the 2026-06-22 run).

All accounts use the password in `BOOTSTRAP_PASSWORD` (default in `.env.example`: `WaypointJudge2026!`). The loader also signs in with PIN `1234`.

| Role | Email | Context |
|---|---|---|
| Dispatcher | `dispatcher@waypoint.local` | Peliyagoda depot |
| Loader | `loader@waypoint.local` | Peliyagoda dock (shared terminal) |
| Driver | `driver@waypoint.local` | `VEH035`, Peliyagoda reefer van |
| Store manager | `store@waypoint.local` | `OUT001`, Fresh Colombo (van-only) |
| Store manager | `store.deferred@waypoint.local` | `OUT055`, Fresh Galle |
| Any other store | `store.out0NN@waypoint.local` (for example `store.out014@waypoint.local`) | One account per outlet |

Stores can also sign in with their Outlet ID (for example `OUT001`) and the same password. The loader can use the "Dock terminal? Use PIN" option with `loader@waypoint.local` and PIN `1234`.

---

## 3. End-to-End Walkthrough (Judge Evaluation Flow)

The seeded day is **Monday 22 June 2026** at the Peliyagoda depot (36 orders, 10 vehicles in the workshop, so demand is above capacity). The business clock starts on Sunday 21 June at 15:00, one hour before the 16:00 cutoff. Sign in at `/` with the accounts above (the password is in section 2).

```
Store orders -> Dispatcher plans and publishes -> Loader loads and seals -> Driver delivers -> Store confirms
```

**1. Store manager places an order (optional, do it before step 2).** Sign in with Outlet ID `OUT001`. Open **New order**, pick an item and quantity, choose the delivery day and submit. The order appears in the dispatcher's queue.

**2. Dispatcher plans the day.** Sign in as `dispatcher@waypoint.local`.
1. **Order queue**: review the orders, then **Close queue & lock**.
2. **Allocation plan**: **Generate plan**. Check the trips, loads and ETAs; use **Reassign stop** or **Defer order** if you want to change something (the server refuses any move that breaks capacity, refrigeration, van-only access, delivery windows, trip time or fuel).
3. **Deferrals**: about seven orders cannot be served, each with the reason. Use **Accept planner proposals** for routine ones (outlets skipped on an earlier run need your own note), then **Record reviewed deferrals**.
4. **Allocation plan**: **Publish plan**. Loaders, drivers and stores see the plan only after this step.

**3. Loader loads the vehicle.** Sign in as `loader@waypoint.local` (or use "Dock terminal? Use PIN" with PIN `1234`). Open the trip for `VEH035`. Items are listed last stop first, so the last delivery is loaded first. Tick each item; to test a shortage, flag one (the dispatcher then opens **Live tracking**, the trip, and chooses **Accept shortfall**). Open **Review**, reload the list if prompted, then **Mark trip ready**. The trip is sealed.

**4. Driver runs the route.** Sign in as `driver@waypoint.local` (use a phone-sized screen). **My route**: **Start trip** (available once the loader has sealed it). At the first stop tick "I am safely parked" and **Mark arrived**.

**5. Store shows the receipt code.** As the store manager of that stop (the first stop in the seeded plan is `OUT001`), open the order and choose **Show receipt code to driver**. A four-digit code appears.

**6. Driver records the delivery.** Check the unloaded quantities (lower one and add a note to test a short delivery), continue, enter the recipient name and the four-digit code, then **Verify code & record handover**. A wrong code is refused and five wrong tries lock the stop.

**7. Store confirms.** The store manager chooses **This matches what arrived** or **Report an issue**. The dispatcher's **Live tracking** shows the stop result and any discrepancy.

**8. Finish.** Later stops belong to other outlets; sign in as that outlet (`store.out0NN@waypoint.local`, or its Outlet ID) to issue the code, or use **Record stop as not delivered**. When every stop has an outcome, the driver chooses **Finish trip**.

The stops in each trip can change if you add orders before generating the plan.

---

## 4. Demo Clock

The business clock only matters for the order cutoff, the next operating day and receipt-code expiry. A dispatcher token can move it:

```bash
# Advance 60 minutes
curl -X POST http://localhost/api/v1/admin/demo/advance \
  -H "Content-Type: application/json" -H "Authorization: Bearer <DISPATCHER_TOKEN>" \
  -d '{"minutes": 60}'

# Set an exact time (keep it inside the official calendar, 2024-01-01 to 2026-06-28)
curl -X POST http://localhost/api/v1/admin/demo/clock \
  -H "Content-Type: application/json" -H "Authorization: Bearer <DISPATCHER_TOKEN>" \
  -d '{"simulated_now": "2026-06-21T16:00:00+05:30"}'

# Return the clock to BUSINESS_NOW
curl -X POST http://localhost/api/v1/admin/demo/reset -H "Authorization: Bearer <DISPATCHER_TOKEN>"
```

Any other role gets a 403. To return the data to its initial state, recreate the database volume (`docker compose down -v`).

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
