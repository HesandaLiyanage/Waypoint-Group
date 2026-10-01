import { OutboxItem, SyncEvent, SyncPushResponse, SyncPullResponse } from '@waypoint/domain';

export interface StorageAdapter {
  init(): Promise<void>;
  saveOutboxItem(item: OutboxItem): Promise<void>;
  getPendingOutboxItems(): Promise<OutboxItem[]>;
  updateOutboxItemStatus(
    id: string,
    status: OutboxItem['status'],
    error?: string
  ): Promise<void>;
  removeOutboxItem(id: string): Promise<void>;
  saveEntity<T = any>(entityType: string, entityId: string, data: T, version: number): Promise<void>;
  getEntity<T = any>(entityType: string, entityId: string): Promise<T | null>;
  getAllEntities<T = any>(entityType: string): Promise<T[]>;
  deleteEntity(entityType: string, entityId: string): Promise<void>;
  getMeta(key: string): Promise<any>;
  setMeta(key: string, value: any): Promise<void>;
}

export interface SyncTransport {
  push(events: SyncEvent[]): Promise<SyncPushResponse>;
  pull(cursor?: string): Promise<SyncPullResponse>;
}

export type SyncState = 'idle' | 'pushing' | 'pulling' | 'error';

export interface SyncStats {
  pendingOutboxCount: number;
  lastSyncedAt: string | null;
  lastCursor: string | null;
}
