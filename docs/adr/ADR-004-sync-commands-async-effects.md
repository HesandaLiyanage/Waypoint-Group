# ADR-004: Synchronous for Commands, Asynchronous for Effects

## Status
Accepted

## Context
User operations in retail logistics range from immediate interactive decisions (submitting an order, generating a plan, sealing a trip) to background side-effects (notifying store managers, updating downstream ETAs, post-processing photos).

## Decision
- **Synchronous Commands:** Any action where a user requires an immediate deterministic answer (Order Submit, Plan Generation, Plan Publish, Seal Trip, Confirm Receipt) executes synchronously within a tight request-response lifecycle.
- **Asynchronous Effects:** All downstream side-effects (SMS delivery, mobile push notifications, ETA drift recomputation, photo processing, scheduled order cutoff closing) are written to the database outbox in the same transaction as the command, and processed by background worker goroutines.
- **ML Integration:** ML calls are synchronous from the planning/ETA pipeline with a strict 300 ms timeout and circuit breaker fallback to heuristic rules. ML inference is never called inside an active database transaction.

## Consequences
### Positive
- Predictable and fast client interactions without waiting on external or slow dependencies.
- Reliability: system failure after command persistence will not lose downstream notifications or updates.
- Predictable transaction lifecycles and minimal lock contention.
