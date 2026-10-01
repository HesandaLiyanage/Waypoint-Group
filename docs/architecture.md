# Waypoint Group Architecture

## System Overview

Waypoint Group is an operations, logistics, and field management platform designed with an offline-first architecture, clean domain boundaries, and responsive role shells.

```
                          +-------------------+
                          |   Caddy Proxy     |
                          |   (Port 80/443)   |
                          +---------+---------+
                                    |
          +-------------------------+-------------------------+
          |                         |                         |
          v                         v                         v
+-------------------+     +-------------------+     +-------------------+
|   apps/web        |     |   apps/api        |     |   apps/ml         |
|   (Vite React PWA)|     |   (Go Modular     |     |   (FastAPI ML     |
|   4 Role Shells   |     |    Monolith)      |     |    Inference)     |
+---------+---------+     +---------+---------+     +-------------------+
          |                         |
          v                         v
+-------------------+     +-------------------+
|   IndexedDB       |     |   PostgreSQL      |
|   Local Outbox    |     |   (Port 5432)     |
+-------------------+     +-------------------+
```

## Directory Structure

- **`apps/api`**: Go modular monolith organizing modules for authentication, operational waypoints, offline synchronization, and ML integration.
- **`apps/ml`**: Python FastAPI service providing ETA predictions and nearest-neighbor route sequence optimization.
- **`apps/web`**: Single Progressive Web App (PWA) built with Vite, React 18, and TypeScript hosting four specialized role shells.
- **`packages/api-client`**: Strongly-typed TypeScript client generated against OpenAPI 3.0 specs.
- **`packages/domain`**: Domain models, Zod validation schemas, sync event definitions, and Asia/Colombo time utilities.
- **`packages/sync-core`**: Offline outbox queuing, IndexedDB adapter, retry backoff, and delta pull sync engine.
- **`packages/i18n`**: Trilingual localization dictionaries (English, Sinhala, Tamil).
- **`packages/design-tokens`**: Unified design tokens (colors, typography, role shell accents, spacing).
- **`contracts/openapi.yaml`**: Source of truth contract defining REST endpoints and schemas.
- **`db/`**: PostgreSQL initialization scripts and migration schemas.
- **`Caddyfile`**: Local and production edge reverse proxy rules.
