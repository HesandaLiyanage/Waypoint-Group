import { useMemo } from 'react';
import { useSync } from '../../context/SyncContext';
import type { LoadItem, Stop, Trip } from './mockData';

type Row = Record<string, any>;
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Colombo' });

export type LiveTrip = Trip & { planVersion: number; acknowledged: boolean; tripStatus: string };

// Loader trips come from the published plan only. Item state is the latest recorded check for each order line.
export function useLoaderTrips(): { trips: LiveTrip[]; ready: boolean } {
  const { workspace } = useSync();
  return useMemo(() => {
    if (!workspace) return { trips: [], ready: false };
    const latestDate = workspace.plans.map((p: Row) => String(p.plan_date).slice(0, 10)).sort().pop();
    const plans = new Map<string, Row>(workspace.plans.filter((p: Row) => String(p.plan_date).slice(0, 10) === latestDate).map((p: Row) => [p.id, p]));
    const outlets = new Map<string, Row>(workspace.outlets.map((o: Row) => [o.outlet_id, o]));
    const catalog = new Map<string, Row>(workspace.catalog.map((c: Row) => [c.sku, c]));
    const latest = new Map<string, Row>();
    for (const c of workspace.checks) latest.set(`${c.stop_id}:${c.line_no}`, c); // checks arrive oldest first
    const trips = workspace.trips
      .filter((t: Row) => plans.has(t.plan_id))
      .sort((a: Row, b: Row) => String(a.planned_depart).localeCompare(String(b.planned_depart)))
      .map((t: Row): LiveTrip => {
        const plan = plans.get(t.plan_id)!;
        const stops: Stop[] = workspace.stops
          .filter((s: Row) => s.trip_id === t.id)
          .sort((a: Row, b: Row) => a.seq - b.seq)
          .map((s: Row): Stop => {
            const order = workspace.orders.find((o: Row) => o.id === s.order_id) ?? {};
            const outlet = outlets.get(order.outlet_id) ?? {};
            const items: LoadItem[] = workspace.lines
              .filter((l: Row) => l.order_id === s.order_id)
              .sort((a: Row, b: Row) => a.line_no - b.line_no)
              .map((l: Row): LoadItem => {
                const check = latest.get(`${s.id}:${l.line_no}`);
                const name = catalog.get(l.sku)?.name_en ?? l.name_en ?? l.sku;
                const state = !check ? 'pending' : check.status === 'ok' ? 'loaded' : 'flagged';
                return {
                  id: `${s.id}:${l.line_no}`, name, detail: `${l.qty} units · ${l.sku}`, sku: l.sku,
                  temp: l.temp_requirement === 'chilled' ? 'chilled' : 'ambient', expected: Number(l.qty), unit: 'units', state,
                  flag: check && state === 'flagged' ? { kind: check.status === 'damaged' ? 'damaged' : 'short', found: Number(l.qty) - Number(check.qty_short ?? 0), sentAt: check.at ? TIME.format(new Date(check.at)) : '' } : undefined,
                };
              });
            return {
              seq: s.seq, outlet: order.outlet_id ?? '', name: `${outlet.brand ?? order.brand} · ${outlet.district ?? ''}`,
              dock: outlet.dock_type === 'street' ? 'Street' : outlet.dock_type === 'mall_bay' ? 'Mall bay' : 'Rear dock',
              window: `${String(s.window_open).slice(0, 5)}–${String(s.window_close).slice(0, 5)}`, items,
            };
          });
        const chilled = stops.some((s) => s.items.some((i) => i.temp === 'chilled'));
        const acknowledged = t.acknowledged_version === plan.version;
        return {
          id: t.id, label: t.vehicle_id, brand: t.brand, district: t.district, depart: TIME.format(new Date(t.planned_depart)),
          vehicle: t.vehicle_id, bay: '', extra: `Trip ${t.trip_no}`,
          tags: [{ label: chilled ? 'Chilled + ambient' : 'Ambient', tone: 'info' }],
          planUpdated: acknowledged ? undefined : `v${plan.version}`, stops, planVersion: plan.version, acknowledged, tripStatus: t.status,
        };
      });
    return { trips, ready: true };
  }, [workspace]);
}
