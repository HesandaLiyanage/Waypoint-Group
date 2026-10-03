# AI Disclosure Statement

In accordance with Hackathon guidelines and transparent engineering practices, this document details the collaboration between human engineering and AI assistance in the design, implementation, and verification of the Waypoint Delivery Platform backend.

## 1. Architecture & Design
- **Human-Designed & Decided:**
  - Architecture decisions (ADR-1 through ADR-8): Modular monolith pattern, PostgreSQL as single datastore, synchronous commands with asynchronous outbox effects, contract-first OpenAPI workflow, append-only offline sync event log, integer arithmetic for capacity.
  - Domain rules: Sri Lankan logistical constraints, operating windows (Fresh pre-08:00 cutoff, trading day windows), fuel quota ledger model, brand and district grouping rules, multi-temp order splitting.
  - State machines: Order, Plan, Trip, Stop lifecycles and recovery transitions.
- **AI-Assisted Drafting:**
  - Initial OpenAPI 3.0.3 specification structure based on domain requirements.
  - SQL schema migrations and table relationship mapping.
  - Markdown documentation formatting and Mermaid diagram structuring.

## 2. Code Generation & Implementation
- **Tooling Used:**
  - Google DeepMind Antigravity Agent pairing with developer.
  - `oapi-codegen` for strict Go server stubs and request/response types.
  - `goose` for versioned PostgreSQL schema migrations.
  - Standard Go toolchain (`go test`, `go vet`, `golangci-lint`).
- **AI-Generated Components (All reviewed, refined, and tested):**
  - OpenAPI 3.0.3 YAML contract and schema definitions.
  - PostgreSQL schema migrations in `apps/api/migrations/`.
  - Reference data CSV loaders and synthetic demo-day data generator.
  - Core planning engine algorithms (pure validator, greedy best-fit allocator, repair heuristics).
  - Outbox worker pool, SSE subscriber hub, and offline sync transaction processor.
  - Unit, property (`rapid`), and integration tests.

## 3. Human Review & Verification
- **Code Review:** Every line of code was inspected for correctness, memory safety, concurrency safety, and compliance with the competition brief.
- **Automated Verification:**
  - Golden tests (Section 5.4 Golden Tests A & B) for trip-time and stop allowances.
  - Property-based tests via `pgregory.net/rapid` ensuring mathematical invariants hold across randomized fleets and demand profiles.
  - Integration tests with real PostgreSQL databases verifying atomic publishing, advisory locks, idempotency key replays, and conflict handling.
  - End-to-end judge walkthrough verification script.

## 4. Multi-lingual Strings (Sinhala & Tamil)
- Sinhala (`si`) and Tamil (`ta`) translations in reference catalogs and error code parameter templates were drafted with AI linguistic assistance and structured for key-based localization on the frontend.
