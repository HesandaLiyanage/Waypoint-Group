# Waypoint Delivery Platform: Architecture

This document describes the high-level architecture, module boundaries, data flow, and failure recovery modes of the Waypoint Delivery Platform.

---

## 1. System Architecture Diagram

```mermaid
flowchart TD
    subgraph Clients["Frontend Clients (Browser / PWA)"]
        D1["Central Dispatcher (Desktop)"]
        L1["Dock Loader (Tablet)"]
        DR1["Driver (Mobile Phone - Offline Capable)"]
        S1["Store Manager (Desktop / Phone)"]
    end

    subgraph Edge["Edge Layer (Caddy 2)"]
        CADDY["Caddy Reverse Proxy\nTLS, Brotli/Zstd, Unbuffered SSE"]
    end

    subgraph Backend["Go Modular Monolith (apps/api)"]
        subgraph API["HTTP & Security Layer"]
            ROUTER["ServeMux Router\n(OpenAPI Strict Server)"]
            MIDDLEWARE["Middleware Pipeline\nReqID, SecurityHeaders, RateLimit, Idempotency, JWT Auth"]
        end

        subgraph Modules["Domain Modules"]
            AUTH["Identity & Auth\n(Argon2id, JWT)"]
            REF["Reference Data\n(CSVs, Outlets, Vehicles)"]
            ORDERING["Ordering Engine\n(Cutoff 16:00, Multi-temp Split)"]
            PLANNING["Planning & Allocation Engine\n(Trip Budget, Fuel Math, Rules 1-7)"]
            SYNC["Offline Driver Sync Engine\n(Savepoints, Fact Ingestion)"]
            ETA["ETA & Service Predictor\n(Circuit Breaker + Heuristic)"]
        end

        subgraph Infra["Platform Services"]
            OUTBOX_WORKER["Transactional Outbox Worker\n(FOR UPDATE SKIP LOCKED)"]
            SSE_HUB["Server-Sent Events Hub\n(Scoped Broadcasts, Last-Event-ID)"]
            CLOCK["Demo Clock\n(Asia/Colombo Simulation)"]
        end
    end

    subgraph Datastore["Single Datastore"]
        PG[("PostgreSQL 16\nRelational Data + Outbox + Event Feed + Idempotency")]
    end

    subgraph MLService["ML Microservice (apps/ml)"]
        FASTAPI["FastAPI Python 3.12\nInference & Heuristic Engine"]
    end

    D1 & L1 & DR1 & S1 -->|HTTPS: REST / JSON| CADDY
    D1 & L1 & DR1 & S1 -->|text/event-stream: SSE| CADDY
    CADDY -->|Reverse Proxy| ROUTER
    ROUTER --> MIDDLEWARE
    MIDDLEWARE --> Modules
    Modules --> PG
    Modules --> OUTBOX_WORKER
    Modules --> SSE_HUB
    OUTBOX_WORKER --> PG
    SSE_HUB --> PG
    ETA -->|300ms Timeout + Breaker| FASTAPI
```

---

## 2. In-Process Domain Events & Outbox Pattern (ADR-004)

```mermaid
sequenceDiagram
    autonumber
    actor Store as Store Manager
    participant API as Ordering Module
    participant DB as PostgreSQL 16
    participant Worker as Outbox Worker
    participant Hub as SSE Hub
    actor Dispatcher as Dispatcher

    Store->>API: POST /api/v1/orders (Idempotency-Key)
    activate API
    API->>DB: BEGIN Transaction
    API->>DB: Insert Order & Lines
    API->>DB: Insert Outbox Task ("order.placed")
    API->>DB: COMMIT Transaction
    API-->>Store: 201 Created (Order Details)
    deactivate API

    loop Every 2 Seconds (SKIP LOCKED)
        Worker->>DB: SELECT * FROM outbox FOR UPDATE SKIP LOCKED
        Worker->>Hub: Publish Domain Event
        Hub->>DB: Insert event_feed (scope: "depot:Peliyagoda")
        Hub-->>Dispatcher: SSE Event ("ORDER_CONFIRMED")
        Worker->>DB: DELETE FROM outbox WHERE id = msg.id
    end
```

---

## 3. Resilient ML Service Integration (ADR-004)

```mermaid
flowchart LR
    CALLER["Planning Engine\nor ETA Predictor"] --> CB{"Circuit Breaker\n(sony/gobreaker)\nTimeout: 300ms"}
    CB -->|Normal / Healthy| ML["FastAPI Service\nPOST /predict/stops"]
    CB -->|Tripped or Timed Out| FALLBACK["Deterministic Heuristic Predictor\n(Section 13 Closed Form)"]
    ML --> RESULT["Predicted Service Min &\nLate Probability"]
    FALLBACK --> RESULT
```

---

## 4. Offline Driver Fact Sync & Conflict Resolution (ADR-006)

1. **Client Source of Truth for What Happened**: Driver mobile app logs events locally with client-generated UUIDv7 identifiers and monotonically increasing device sequence numbers.
2. **Atomic Batch Ingestion**: Drivers submit batched events to `POST /api/v1/sync/push`.
3. **Transaction Savepoints**: Each event in the batch executes inside a PostgreSQL `SAVEPOINT`. If an individual event is invalid, only that savepoint is rolled back; valid events are safely committed.
4. **Optimistic Version Verification**: If an event operates against an older plan version, the server accepts the fact, recalculates downstream delays, updates ETAs, and returns `conflict: true` with the latest entities so the client reconciles immediately.
5. **Real-Time Dispatcher Notification**: Stop arrival and delivery events automatically trigger SSE updates on the `depot:<Depot>` scope so dispatchers see live progress without manual refreshing.
