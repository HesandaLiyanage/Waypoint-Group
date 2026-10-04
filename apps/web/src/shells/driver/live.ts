import { useMemo } from 'react';
import { useSync } from '../../context/SyncContext';
import type { DriverStop, DriverTrip } from './model';

type Row = Record<string, any>;
const HH = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Colombo' });
export const DONE_STATUSES = ['delivered', 'delivered_short', 'receipt_confirmed', 'receipt_disputed', 'failed'];

// The driver's assigned trip, built only from the server workspace (the server already scopes it to this vehicle).
export function useDriverTrip(): { trip: (DriverTrip & { status: string; stopStatus: Record<string, string> }) | null; ready: boolean } {
  const { workspace } = useSync();
  return useMemo(() => {
    if (!workspace) return { trip: null, ready: false };
    const trips = [...workspace.trips].sort((a: Row, b: Row) => String(a.planned_depart).localeCompare(String(b.planned_depart)));
    // Current trip: the first one not yet completed, otherwise the last one.
    const t: Row | undefined = trips.find((x: Row) => x.status !== 'completed') ?? trips[trips.length - 1];
    if (!t) return { trip: null, ready: true };
    const plan = workspace.plans.find((p: Row) => p.id === t.plan_id);
    const vehicle = workspace.vehicles.find((v: Row) => v.vehicle_id === t.vehicle_id) ?? {};
    const outlets = new Map<string, Row>(workspace.outlets.map((o: Row) => [o.outlet_id, o]));
    const catalog = new Map<string, Row>(workspace.catalog.map((c: Row) => [c.sku, c]));
    const stopStatus: Record<string, string> = {};
    const stops: DriverStop[] = workspace.stops
      .filter((s: Row) => s.trip_id === t.id)
      .sort((a: Row, b: Row) => a.seq - b.seq)
      .map((s: Row): DriverStop => {
        const order = workspace.orders.find((o: Row) => o.id === s.order_id) ?? {};
        const outlet = outlets.get(order.outlet_id) ?? {};
        stopStatus[s.id] = s.status;
        return {
          id: s.id, outletId: order.outlet_id ?? '', name: `${outlet.brand ?? order.brand} · ${outlet.district ?? ''}`, district: outlet.district ?? '',
          window: `${String(s.window_open).slice(0, 5)}–${String(s.window_close).slice(0, 5)}`,
          access: outlet.parking_constraint === 'van_only' ? 'Van only' : 'Standard vehicle access',
          dock: outlet.dock_type === 'street' ? 'Street unloading' : outlet.dock_type === 'mall_bay' ? 'Shared mall bay' : 'Rear dock',
          plannedArrival: s.eta ? HH.format(new Date(s.eta)) : '–',
          // Items are keyed by order line number: that is what the server expects when recording what was received.
          items: workspace.lines
            .filter((l: Row) => l.order_id === s.order_id)
            .sort((a: Row, b: Row) => a.line_no - b.line_no)
            .map((l: Row) => ({ sku: String(l.line_no), name: catalog.get(l.sku)?.name_en ?? l.name_en ?? l.sku, expected: Number(l.qty), temperature: (l.temp_requirement === 'chilled' ? 'Chilled' : 'Ambient') as 'Chilled' | 'Ambient' })),
        };
      });
    const type = vehicle.type === 'van' ? 'van' : 'truck';
    return {
      ready: true,
      trip: {
        id: t.id, vehicleId: t.vehicle_id, vehicleType: `${vehicle.temp === 'reefer' ? 'Refrigerated' : 'Ambient'} ${type}`,
        depot: plan?.depot ?? '', date: String(plan?.plan_date ?? '').slice(0, 10), planVersion: plan?.version ?? 0,
        weightCapacity: Number(vehicle.weight_cap_kg ?? 0), volumeCapacity: Number(vehicle.volume_cap_m3 ?? 0), stops, status: t.status, stopStatus,
      },
    };
  }, [workspace]);
}
