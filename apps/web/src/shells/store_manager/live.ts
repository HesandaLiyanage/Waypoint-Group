import { useMemo } from 'react';
import { useSync } from '../../context/SyncContext';
import type { Consignment } from './storeData';

type Row = Record<string, any>;
const HH = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Colombo' });
const hhmm = (v?: string) => (v ? HH.format(new Date(v)) : '');

export interface LiveConsignment extends Consignment {
  orderUid: string;
  stopId?: string;
  stopStatus?: string; // pending | arrived | delivered | delivered_short | receipt_confirmed | receipt_disputed | failed
  planVersion?: number;
  code?: { value: string; expiresAt?: string };
  received?: { line: number; qty: number }[];
  deliveryDate: string;
}

// The store's own orders, their schedule and receipt state, from the server workspace only.
export function useStoreData(): { items: LiveConsignment[]; ready: boolean } {
  const { workspace } = useSync();
  return useMemo(() => {
    if (!workspace) return { items: [], ready: false };
    const catalog = new Map<string, Row>(workspace.catalog.map((c: Row) => [c.sku, c]));
    const items = [...workspace.orders]
      .sort((a: Row, b: Row) => String(b.delivery_date).localeCompare(String(a.delivery_date)) || String(a.ref).localeCompare(String(b.ref)))
      .map((o: Row): LiveConsignment => {
        const stop = workspace.stops.find((s: Row) => s.order_id === o.id);
        const trip = stop && workspace.trips.find((t: Row) => t.id === stop.trip_id);
        const plan = stop && workspace.plans.find((p: Row) => p.id === stop.plan_id);
        const deferral = workspace.deferrals.find((d: Row) => d.order_id === o.id);
        const code = stop && workspace.codes.find((c: Row) => c.stop_id === stop.id);
        const receipt = stop && workspace.receipts.find((r: Row) => r.stop_id === stop.id);
        const lines = workspace.lines.filter((l: Row) => l.order_id === o.id).sort((a: Row, b: Row) => a.line_no - b.line_no);
        const finished = ['delivered', 'delivered_short', 'failed'].includes(o.status);
        const status: Consignment['status'] = o.status === 'deferred' ? 'deferred' : finished ? 'delivered' : 'in_transit';
        const date = String(o.delivery_date).slice(0, 10);
        const window = o.status === 'deferred' && deferral
          ? `Moved to ${String(deferral.carried_to).slice(0, 10)}`
          : finished ? `${o.status === 'failed' ? 'Not delivered' : 'Delivered'} · ${date}`
          : stop ? `${date} · window ${String(stop.window_open).slice(0, 5)}–${String(stop.window_close).slice(0, 5)}`
          : `${date} · waiting for the dispatcher's plan`;
        return {
          id: o.ref, orderUid: o.id, deliveryDate: date, status, window,
          summary: lines.map((l: Row) => catalog.get(l.sku)?.name_en ?? l.sku).slice(0, 3).join(', '),
          crates: Number(o.total_units), vehicle: trip?.vehicle_id, eta: stop?.eta ? `ETA ${hhmm(stop.eta)}` : undefined,
          note: deferral ? `${deferral.explanation?.reason ?? deferral.reason_code}` : o.is_late ? 'Placed after the 16:00 cutoff' : '',
          skus: lines.map((l: Row) => ({ name: catalog.get(l.sku)?.name_en ?? l.sku, sku: l.sku, crates: Number(l.qty), qty: `${l.qty} units`, telemetry: '', target: '', temp: l.temp_requirement })),
          stopId: stop?.id, stopStatus: stop?.status, planVersion: plan?.version,
          code: code?.receipt_code ? { value: code.receipt_code, expiresAt: code.expires_at } : undefined,
          received: receipt?.lines?.items?.map((i: Row) => ({ line: i.line_no, qty: i.received_qty })),
        };
      });
    return { items, ready: true };
  }, [workspace]);
}
