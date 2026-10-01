# Waypoint Database Layer

PostgreSQL schema and migrations for the Waypoint platform.

## Migrations

Migrations are stored in `migrations/` and automatically mounted into Docker Compose's PostgreSQL container (`/docker-entrypoint-initdb.d`):

- `000001_initial_schema.sql`: Sets up core enums, `users`, `waypoints`, `sync_events` delta table, and seed data.

## Connecting Locally

```bash
psql -h localhost -p 5432 -U postgres -d waypoint_db
```
Default password in development is `postgres`.
