import { IndexedDBAdapter } from './adapter/indexeddb';
import { OutboxManager } from './outbox/manager';
import { PullEngine } from './pull/engine';
import { StorageAdapter, SyncStats, SyncTransport } from './types';

export class SyncClient {
  public adapter: StorageAdapter;
  public outbox: OutboxManager;
  public pullEngine: PullEngine;

  constructor(adapter?: StorageAdapter, transport?: SyncTransport) {
    this.adapter = adapter || new IndexedDBAdapter();
    this.outbox = new OutboxManager(this.adapter, transport);
    this.pullEngine = new PullEngine(this.adapter, transport);
  }

  async init(): Promise<void> {
    await this.adapter.init();
  }

  setTransport(transport: SyncTransport) {
    this.outbox.setTransport(transport);
    this.pullEngine.setTransport(transport);
  }

  /**
   * Run full bidirectional sync cycle: Push outbox -> Pull latest deltas
   */
  async synchronize(): Promise<{ pushed: number; pulled: number }> {
    const pushResult = await this.outbox.flush();
    const pullResult = await this.pullEngine.pull();
    return {
      pushed: pushResult.pushed,
      pulled: pullResult.appliedEvents,
    };
  }

  async getStats(): Promise<SyncStats> {
    const pending = await this.outbox.getPending();
    const lastSyncedAt = await this.adapter.getMeta('lastSyncedAt');
    const lastCursor = await this.adapter.getMeta('lastCursor');

    return {
      pendingOutboxCount: pending.length,
      lastSyncedAt: lastSyncedAt || null,
      lastCursor: lastCursor || null,
    };
  }
}
