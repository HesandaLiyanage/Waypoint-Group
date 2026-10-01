import {
  OutboxItem,
  SyncEvent,
  SyncMutationType,
} from '@waypoint/domain';
import { StorageAdapter, SyncTransport } from '../types';

export class OutboxManager {
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
   * Enqueue a new mutation to be processed locally and pushed when online
   */
  async enqueueMutation<T extends Record<string, any> = Record<string, any>>(
    entityType: 'waypoint' | 'user' | 'note' | 'location_ping',
    entityId: string,
    action: SyncMutationType,
    payload: T
  ): Promise<OutboxItem<T>> {
    const eventId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const event: SyncEvent<T> = {
      eventId,
      entityType,
      entityId,
      action,
      payload,
      clientTimestamp: new Date().toISOString(),
      version: 1,
    };

    const outboxItem: OutboxItem<T> = {
      id: `outbox_${eventId}`,
      event,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    // Optimistically update local entity cache
    if (action === 'DELETE') {
      await this.adapter.deleteEntity(entityType, entityId);
    } else {
      await this.adapter.saveEntity(entityType, entityId, payload, 1);
    }

    // Persist to outbox store
    await this.adapter.saveOutboxItem(outboxItem);
    return outboxItem;
  }

  /**
   * Get all queued pending outbox mutations
   */
  async getPending(): Promise<OutboxItem[]> {
    return this.adapter.getPendingOutboxItems();
  }

  /**
   * Push all pending outbox entries to remote server
   */
  async flush(): Promise<{ pushed: number; failed: number }> {
    if (!this.transport) {
      throw new Error('SyncTransport not configured on OutboxManager');
    }

    const pending = await this.getPending();
    if (pending.length === 0) {
      return { pushed: 0, failed: 0 };
    }

    // Mark items as syncing
    for (const item of pending) {
      await this.adapter.updateOutboxItemStatus(item.id, 'syncing');
    }

    try {
      const events = pending.map((item) => item.event);
      const response = await this.transport.push(events);

      let pushed = 0;
      let failed = 0;

      for (const ack of response.acks) {
        const item = pending.find((p) => p.event.eventId === ack.eventId);
        if (!item) continue;

        if (ack.status === 'ACK') {
          // Successfully committed on server: remove from outbox
          await this.adapter.removeOutboxItem(item.id);
          pushed++;
        } else {
          // Conflict or Error: update status with reason
          await this.adapter.updateOutboxItemStatus(
            item.id,
            'failed',
            ack.errorMessage || ack.status
          );
          failed++;
        }
      }

      if (response.newCursor) {
        await this.adapter.setMeta('lastCursor', response.newCursor);
      }

      return { pushed, failed };
    } catch (err: any) {
      // Revert status to failed for retry
      for (const item of pending) {
        await this.adapter.updateOutboxItemStatus(
          item.id,
          'failed',
          err?.message || 'Network request failed'
        );
      }
      throw err;
    }
  }
}
