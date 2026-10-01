import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SyncClient } from '@waypoint/sync-core';
import { WaypointApiClient } from '@waypoint/api-client';
import { Waypoint, SyncMutationType } from '@waypoint/domain';
import { useAuth } from './AuthContext';

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  waypoints: Waypoint[];
  enqueueWaypointMutation: (
    action: SyncMutationType,
    waypoint: Partial<Waypoint> & { id: string }
  ) => Promise<void>;
  triggerSync: () => Promise<void>;
  refreshWaypoints: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);

  // API Client
  const apiClient = React.useMemo(() => {
    const apiUrl = import.meta.env.VITE_API_URL || '/api/v1';
    return new WaypointApiClient({
      baseUrl: apiUrl,
      getToken: () => token,
    });
  }, [token]);

  // SyncClient with IndexedDB Adapter & Transport
  const [syncClient] = useState(() => {
    const client = new SyncClient();
    return client;
  });

  // Setup transport connecting syncClient to the Go modular monolith API
  useEffect(() => {
    syncClient.setTransport({
      push: async (events) => {
        return (await apiClient.pushSync({
          client_id: `pwa_${navigator.userAgent.slice(0, 20)}`,
          events: events.map((e) => ({
            event_id: e.eventId,
            entity_type: e.entityType,
            entity_id: e.entityId,
            action: e.action,
            payload: e.payload,
            client_timestamp: e.clientTimestamp,
            version: e.version,
          })),
        })) as any;
      },
      pull: async (cursor) => {
        const res = await apiClient.pullSync(cursor);
        return {
          events: res.events.map((e) => ({
            eventId: e.event_id,
            entityType: e.entity_type as any,
            entityId: e.entity_id,
            action: e.action,
            payload: e.payload,
            clientTimestamp: e.client_timestamp,
            version: e.version || 1,
          })),
          nextCursor: res.next_cursor,
          hasMore: res.has_more,
        };
      },
    });
  }, [syncClient, apiClient]);

  // Update outbox count from IndexedDB
  const updateStats = useCallback(async () => {
    try {
      const stats = await syncClient.getStats();
      setPendingCount(stats.pendingOutboxCount);
      setLastSyncedAt(stats.lastSyncedAt);
    } catch {
      // IndexedDB not ready or memory fallback
    }
  }, [syncClient]);

  // Fetch or refresh waypoints
  const refreshWaypoints = useCallback(async () => {
    try {
      if (navigator.onLine) {
        const remoteList = await apiClient.listWaypoints();
        setWaypoints(remoteList as unknown as Waypoint[]);
        // Cache to IndexedDB entities
        for (const wp of remoteList) {
          await syncClient.adapter.saveEntity('waypoint', wp.id, wp, (wp as any).version || 1);
        }
      } else {
        // Load offline cached entities
        const cached = await syncClient.adapter.getAllEntities<Waypoint>('waypoint');
        if (cached && cached.length > 0) {
          setWaypoints(cached);
        }
      }
    } catch (err) {
      console.warn('Network fetch failed, loading from local offline cache:', err);
      const cached = await syncClient.adapter.getAllEntities<Waypoint>('waypoint');
      if (cached && cached.length > 0) {
        setWaypoints(cached);
      }
    }
    await updateStats();
  }, [apiClient, syncClient, updateStats]);

  // Initialize DB and load initial waypoints
  useEffect(() => {
    syncClient.init().then(() => {
      refreshWaypoints();
    });
  }, [syncClient, refreshWaypoints]);

  // Network listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Trigger full sync
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      await syncClient.synchronize();
      await refreshWaypoints();
    } catch (err) {
      console.error('Synchronization failed:', err);
    } finally {
      setIsSyncing(false);
      await updateStats();
    }
  }, [syncClient, isSyncing, refreshWaypoints, updateStats]);

  // Enqueue local mutation
  const enqueueWaypointMutation = async (
    action: SyncMutationType,
    waypoint: Partial<Waypoint> & { id: string }
  ) => {
    // 1. Enqueue to IndexedDB outbox & optimistic cache
    await syncClient.outbox.enqueueMutation('waypoint', waypoint.id, action, waypoint);

    // 2. Optimistically update React state
    setWaypoints((prev) => {
      if (action === 'DELETE') {
        return prev.filter((w) => w.id !== waypoint.id);
      }
      const existingIdx = prev.findIndex((w) => w.id === waypoint.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...waypoint } as Waypoint;
        return updated;
      }
      return [waypoint as Waypoint, ...prev];
    });

    await updateStats();

    // 3. If online, trigger immediate background flush
    if (navigator.onLine) {
      triggerSync();
    }
  };

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        lastSyncedAt,
        waypoints,
        enqueueWaypointMutation,
        triggerSync,
        refreshWaypoints,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
};
