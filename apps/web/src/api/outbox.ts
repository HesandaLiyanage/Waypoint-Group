// Durable command outbox. Commands are written to IndexedDB before any network call,
// so a refresh or restart while offline never loses a driver's or loader's record.

export type OutboxState = 'queued' | 'sending' | 'acknowledged' | 'rejected';

export interface WorkflowCommand {
  id: string;
  action: string;
  trip_id?: string;
  stop_id?: string;
  order_id?: string;
  issue_id?: string;
  plan_version?: number;
  line_no?: number;
  quantity?: number;
  status?: string;
  note?: string;
  date?: string;
  depot?: string;
  recipient?: string;
  code?: string;
  lines?: { line_no: number; received_qty: number }[];
  photo?: string; // data URL, persisted with the command until acknowledged
}

export interface OutboxItem {
  id: string;
  userId: string;
  command: WorkflowCommand;
  state: OutboxState;
  error?: string;
  createdAt: string;
  seq: number;
}

const DB = 'waypoint-outbox';
const STORE = 'commands';
const memory = new Map<string, OutboxItem>(); // used only when IndexedDB is unavailable

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      })
  );
}

export async function putItem(item: OutboxItem): Promise<void> {
  memory.set(item.id, item);
  await tx('readwrite', (s) => s.put(item));
}

export async function deleteItem(id: string): Promise<void> {
  memory.delete(id);
  await tx('readwrite', (s) => s.delete(id));
}

export async function listItems(userId: string): Promise<OutboxItem[]> {
  const stored = (await tx<OutboxItem[]>('readonly', (s) => s.getAll())) ?? [...memory.values()];
  return stored.filter((i) => i.userId === userId).sort((a, b) => a.seq - b.seq);
}
