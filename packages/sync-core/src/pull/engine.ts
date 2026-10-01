import { SyncEvent } from '@waypoint/domain';
import { StorageAdapter, SyncTransport } from '../types';

export class PullEngine {
  private adapter: StorageAdapter;
  private transport?: SyncTransport;

  constructor(adapter: StorageAdapter, transport?: SyncTransport) {
    this.adapter = adapter;
    this.transport = transport;
  }

  setTransport(transport: SyncTransport) {
    this.transport = transport;
  }

  /**
   * Pull delta changes from the server and apply to local storage
   */
  async pull(): Promise<{ appliedEvents: number; nextCursor: string | null }> {
    if (!this.transport) {
      throw new Error('SyncTransport not configured on PullEngine');
    }

    const currentCursor = (await this.adapter.getMeta('lastCursor')) || undefined;
    const response = await this.transport.pull(currentCursor);

    let appliedEvents = 0;

    for (const event of response.events) {
      await this.applyEvent(event);
      appliedEvents++;
    }

    if (response.nextCursor) {
      await this.adapter.setMeta('lastCursor', response.nextCursor);
    }
    await this.adapter.setMeta('lastSyncedAt', new Date().toISOString());

    return {
      appliedEvents,
      nextCursor: response.nextCursor || null,
    };
  }

  /**
   * Apply a single incoming delta event to local storage
   */
  private async applyEvent(event: SyncEvent): Promise<void> {
    const { entityType, entityId, action, payload, version } = event;

    if (action === 'DELETE') {
      await this.adapter.deleteEntity(entityType, entityId);
      return;
    }

    // Check if we have pending local outbox item for this entity to prevent overwriting
    const existing = await this.adapter.getEntity(entityType, entityId);
    if (!existing) {
      await this.adapter.saveEntity(entityType, entityId, payload, version);
      return;
    }

    // Merge or server-wins update
    const merged = { ...existing, ...payload };
    await this.adapter.saveEntity(entityType, entityId, merged, version);
  }
}
