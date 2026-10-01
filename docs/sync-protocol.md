# Offline Sync Protocol Specification

## Overview

Waypoint uses a bidirectional sync protocol tailored for field operators and drivers who often experience poor or intermittent cellular connectivity across Sri Lanka.

## Architecture

1. **Local Writes (Optimistic UI)**:
   - When a user performs an action (e.g. updating task status, adding audit notes), the mutation is immediately committed to IndexedDB.
   - An `OutboxItem` is created with a unique UUID `eventId`, timestamp, and mutation action (`CREATE`, `UPDATE`, `DELETE`).

2. **Push Phase (`POST /api/v1/sync/push`)**:
   - As soon as the client detects network connectivity (`navigator.onLine` / window `online` event), pending outbox records are packed into a batch.
   - The Go modular monolith API receives the batch, records them in the `sync_events` sequence log, and returns an array of `SyncAck` records (`ACK`, `CONFLICT`, or `ERROR`).
   - Acknowledged mutations are removed from the client's local outbox.

3. **Pull Phase (`GET /api/v1/sync/pull?since_cursor=...`)**:
   - The client polls or requests delta changes using its last acknowledged cursor.
   - Server responds with new events since that cursor.
   - The client applies updates into its local entity cache using last-write-wins timestamp resolution.

## Schema

```typescript
interface SyncEvent<T = any> {
  eventId: string;
  entityType: 'waypoint' | 'user' | 'note' | 'location_ping';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: T;
  clientTimestamp: string;
  version: number;
}
```
