export type SyncMutationType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncEvent<T = Record<string, any>> {
  eventId: string;
  entityType: 'waypoint' | 'user' | 'note' | 'location_ping';
  entityId: string;
  action: SyncMutationType;
  payload: T;
  clientTimestamp: string;
  version: number;
}

export interface SyncPushRequest {
  clientId: string;
  events: SyncEvent[];
}

export type SyncAckStatus = 'ACK' | 'CONFLICT' | 'ERROR';

export interface SyncAck {
  eventId: string;
  status: SyncAckStatus;
  errorMessage?: string;
  serverVersion?: number;
}

export interface SyncPushResponse {
  acks: SyncAck[];
  newCursor: string;
}

export interface SyncPullResponse {
  events: SyncEvent[];
  nextCursor: string;
  hasMore: boolean;
}

export interface OutboxItem<T = Record<string, any>> {
  id: string; // Unique local outbox ID
  event: SyncEvent<T>;
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
  createdAt: string;
}
