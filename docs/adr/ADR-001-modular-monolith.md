# ADR-001: Modular Monolith Architecture

## Status
Accepted

## Context
Waypoint Group operates 120 retail outlets, 60 delivery vehicles, and two depots (Peliyagoda and Kandy) across three brands (Fresh, Style, Tech). The deployment target is a single resource-constrained server (1-2 vCPU, 2 GB RAM).

A distributed microservices architecture introduces network latency, distributed transactions, partial failures, serialization overhead, operational complexity, and memory footprints that would fail on a small server, without providing scalability advantages at this scale.

## Decision
We adopt a single Go modular monolith deployable (`apps/api`), accompanied only by an external Python ML inference service (`apps/ml`).

Module boundaries are strictly enforced:
- Each module (`identity`, `catalog`, `ordering`, `planning`, `loading`, `delivery`, `receipt`, `sync`, `eta`, `notify`, `audit`) encapsulates its internal repositories and data queries.
- Modules communicate across process boundaries only via explicit Go interface contracts (`api.go`) and asynchronous domain events / outbox messages.
- Cross-module SQL joins are prohibited.
- `golangci-lint` with `depguard` enforces import restrictions.

## Consequences
### Positive
- Zero network hops between domain services.
- Simple local development and deployment via a single Docker container.
- ACID transactions across related domain records within a single database.
- Low memory usage (< 256 MB RAM) well within the 2 GB host budget.
- Clear path to extract microservices in the future if scale warrants.

### Negative
- A crash in one module can potentially crash the entire monolith (mitigated by recover middleware and robust error handling).
