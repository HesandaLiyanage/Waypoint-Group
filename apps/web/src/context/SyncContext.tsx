import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, request } from '../api/http';
import { OutboxItem, WorkflowCommand, deleteItem, listItems, putItem } from '../api/outbox';
import { useAuth } from './AuthContext';

// Rows returned by GET /workspace, scoped by the server to the signed-in role.
export interface Workspace {
  server_time: string;
  outlets: any[];
  vehicles: any[];
  calendar: any[];
  catalog: any[];
  orders: any[];
  lines: any[];
  plans: any[];
  trips: any[];
  stops: any[];
  checks: any[];
  deferrals: any[];
  issues: any[];
  receipts: any[];
  codes: any[];
  capacity: any[];
  confirmations: any[];
  pending_users: any[];
}

export type NewCommand = Omit<WorkflowCommand, 'id'>;

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  rejected: OutboxItem[];
  lastSyncedAt: string | null;
  workspace: Workspace | null;
  workspaceError: string | null;
  send: (command: NewCommand) => Promise<OutboxItem>;
  triggerSync: () => Promise<void>;
  refresh: () => Promise<void>;
  discard: (id: string) => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);
const POLL_MS = 15000;

// Work is saved locally first, queued, sent, then acknowledged or rejected by the server.
export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? '';
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const flushing = useRef(false);
  const seq = useRef(Date.now());

  const reload = useCallback(async () => {
    if (userId) setItems(await listItems(userId));
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setWorkspace(await request<Workspace>('/workspace'));
      setWorkspaceError(null);
      setLastSyncedAt(new Date().toISOString());
    } catch (e) {
      setWorkspaceError(e instanceof Error ? e.message : 'Workspace unavailable');
    }
  }, [userId]);

  const flush = useCallback(async () => {
    if (flushing.current || !userId) return;
    flushing.current = true;
    setIsSyncing(true);
    try {
      for (const item of await listItems(userId)) {
        if (item.state === 'acknowledged' || item.state === 'rejected') continue;
        await putItem({ ...item, state: 'sending' });
        try {
          await request('/workflow/commands', { method: 'POST', body: JSON.stringify(item.command) });
          await deleteItem(item.id); // acknowledged: the server now holds the record
        } catch (e) {
          if (e instanceof ApiError && e.network) {
            await putItem({ ...item, state: 'queued' });
            break; // offline: keep order, try again on reconnect
          }
          // The server refused it (for example PLAN_CHANGED); keep it visible for explicit reconciliation.
          await putItem({ ...item, state: 'rejected', error: e instanceof Error ? e.message : 'Rejected' });
        }
        await reload();
      }
    } finally {
      flushing.current = false;
      setIsSyncing(false);
      await reload();
    }
  }, [userId, reload]);

  const triggerSync = useCallback(async () => {
    await flush();
    await refresh();
  }, [flush, refresh]);

  const send = useCallback(
    async (command: NewCommand) => {
      const item: OutboxItem = {
        id: crypto.randomUUID(),
        userId,
        command: { ...command, id: crypto.randomUUID() },
        state: 'queued',
        createdAt: new Date().toISOString(),
        seq: seq.current++,
      };
      await putItem(item); // saved locally before any network attempt
      await reload();
      if (navigator.onLine) void triggerSync();
      return item;
    },
    [userId, reload, triggerSync]
  );

  const discard = useCallback(
    async (id: string) => {
      await deleteItem(id);
      await reload();
    },
    [reload]
  );

  useEffect(() => {
    setWorkspace(null);
    setItems([]);
    if (!userId) return;
    void reload().then(triggerSync);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void triggerSync();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const up = () => {
      setIsOnline(true);
      void triggerSync();
    };
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [triggerSync]);

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount: items.filter((i) => i.state === 'queued' || i.state === 'sending').length,
        rejected: items.filter((i) => i.state === 'rejected'),
        lastSyncedAt,
        workspace,
        workspaceError,
        send,
        triggerSync,
        refresh,
        discard,
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
