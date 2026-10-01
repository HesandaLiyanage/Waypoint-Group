import { OutboxItem } from '@waypoint/domain';
import { StorageAdapter } from '../types';

const DB_NAME = 'waypoint_sync_db';
const DB_VERSION = 1;

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private dbName: string;

  constructor(dbName = DB_NAME) {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      // In non-browser environments, log warning or maintain memory fallback
      return;
    }

    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Outbox store for queued client offline mutations
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
          outboxStore.createIndex('status', 'status', { unique: false });
          outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Local cache of entities (e.g. waypoints)
        if (!db.objectStoreNames.contains('entities')) {
          db.createObjectStore('entities', { keyPath: 'compositeKey' });
        }

        // Metadata store for cursors, timestamps, settings
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) {
      throw new Error('IndexedDBAdapter is not initialized. Call init() first.');
    }
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async saveOutboxItem(item: OutboxItem): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const store = this.getStore('outbox', 'readwrite');
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingOutboxItems(): Promise<OutboxItem[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const store = this.getStore('outbox', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => {
        const items: OutboxItem[] = req.result || [];
        // Filter pending or retryable failed items
        const pending = items
          .filter((item) => item.status === 'pending' || item.status === 'failed')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(pending);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async updateOutboxItemStatus(
    id: string,
    status: OutboxItem['status'],
    error?: string
  ): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const store = this.getStore('outbox', 'readwrite');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item: OutboxItem = getReq.result;
        if (!item) {
          resolve();
          return;
        }
        item.status = status;
        item.attempts += 1;
        item.lastAttemptAt = new Date().toISOString();
        if (error) item.error = error;

        const putReq = store.put(item);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async removeOutboxItem(id: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const store = this.getStore('outbox', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async saveEntity<T = any>(
    entityType: string,
    entityId: string,
    data: T,
    version: number
  ): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const store = this.getStore('entities', 'readwrite');
      const compositeKey = `${entityType}:${entityId}`;
      const record = {
        compositeKey,
        entityType,
        entityId,
        data,
        version,
        updatedAt: new Date().toISOString(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getEntity<T = any>(entityType: string, entityId: string): Promise<T | null> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const store = this.getStore('entities', 'readonly');
      const compositeKey = `${entityType}:${entityId}`;
      const req = store.get(compositeKey);
      req.onsuccess = () => {
        resolve(req.result ? req.result.data : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllEntities<T = any>(entityType: string): Promise<T[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const store = this.getStore('entities', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => {
        const results = (req.result || [])
          .filter((item: any) => item.entityType === entityType)
          .map((item: any) => item.data);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteEntity(entityType: string, entityId: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const store = this.getStore('entities', 'readwrite');
      const compositeKey = `${entityType}:${entityId}`;
      const req = store.delete(compositeKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getMeta(key: string): Promise<any> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const store = this.getStore('meta', 'readonly');
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result ? req.result.value : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async setMeta(key: string, value: any): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const store = this.getStore('meta', 'readwrite');
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
