# ADR-006: Append-Only Offline Driver Sync Events

## Status
Accepted

## Context
Delivery drivers frequently traverse remote and hill-country areas of Sri Lanka (e.g., Kandy corridor, Nuwara Eliya, rural waypoints) where cellular connectivity is intermittent or non-existent. The driver client must operate completely offline and synchronize reliably upon reconnection.

## Decision
- Driver actions are modeled as append-only facts with client-generated UUIDv7 event identifiers (`event_id`).
- The field is the source of truth for physical events (what actually happened); the dispatcher is the authority for planned state (what should happen).
- In `POST /api/v1/sync/push`, events are processed in batches with savepoints per event: one invalid or duplicate event never aborts the batch.
- Deduplication is guaranteed via unique index on `device_events(event_id)`. Replays return the cached ack status (`accepted | duplicate | rejected`).
- In case of plan conflict (e.g., a stop was canceled or altered in a new plan while the driver was offline, but the driver physically delivered it), the physical fact is accepted, marked `conflict=true`, and an alert is raised to the dispatcher.
- Offline proof of delivery uses four-digit receipt codes: the store manager displays the code, the driver app validates it locally against an HMAC salt hash provided in the morning snapshot, and the server reverifies on sync.

## Consequences
### Positive
- Resilient to network disconnects, device crashes, and retransmission storms.
- Physical truth on the ground is never discarded by the server.
- High developer confidence under flaky network simulations.
