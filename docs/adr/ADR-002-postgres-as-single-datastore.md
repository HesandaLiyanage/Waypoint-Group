# ADR-002: PostgreSQL as Single Datastore

## Status
Accepted

## Context
A production logistics backend requires relational data storage, background job queuing, an transactional outbox, real-time event replays, and idempotency guarantees. Adding standalone message brokers (RabbitMQ/Kafka) or caching layers (Redis) consumes excessive memory and creates multi-system consistency vulnerabilities.

## Decision
PostgreSQL 16 is the sole datastore for all backend persistence needs:
- Relational domain models (orders, plans, trips, stops, catalog, reference data).
- Transactional Outbox with `FOR UPDATE SKIP LOCKED` worker pools and `LISTEN/NOTIFY` push wakeups.
- Event Feed with monotonic sequence IDs (`seq bigserial`) for SSE replay and offline client delta pulls.
- Distributed advisory locks (`pg_advisory_xact_lock`) for leader election and plan publishing atomicity.
- Idempotency store (`idempotency_keys`) scoped per user and key.

## Consequences
### Positive
- Unified ACID transactions across domain updates and outbox events (guaranteeing at-least-once message publication without 2PC).
- Extremely low memory footprint (~256 MB shared buffers).
- Simplified backups (`pg_dump`) with zero inter-system state divergence.

### Negative
- High throughput polling can load the database if not mitigated by `LISTEN/NOTIFY` and generous lease intervals.
