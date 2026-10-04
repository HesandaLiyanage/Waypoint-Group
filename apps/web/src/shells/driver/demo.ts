import { challengeCalendar, challengeOutlets, challengeVehicles } from '../../data/challenge';
import type { DriverTrip } from './model';

// Only master data is official. This route, cargo, schedule and code are demo fixtures.
// Replace this adapter with the assigned-trip API; do not silently fall back to it on API errors.
export const DEMO_RECEIPT_CODE = '4829';
const vehicle = challengeVehicles.find(row => row.vehicle_id === 'VEH035')!;
const date = challengeCalendar.find(row => row.date === '2026-06-22' && row.is_operating === '1')!.date;
export const demoTrip: DriverTrip = {
  id: 'DEMO-TRIP-20260622-01', vehicleId: vehicle.vehicle_id, vehicleType: 'Refrigerated van',
  depot: vehicle.depot, date, planVersion: 1, weightCapacity: Number(vehicle.weight_cap_kg), volumeCapacity: Number(vehicle.volume_cap_m3),
  stops: ['OUT001', 'OUT002', 'OUT003'].map((id, index) => {
    const outlet = challengeOutlets.find(row => row.outlet_id === id)!;
    return {
      id: `DEMO-STOP-${index + 1}`, outletId: id, name: `${outlet.brand} · ${outlet.district}`, district: outlet.district,
      window: `${outlet.window_open_time}–${outlet.window_close_time}`, access: outlet.parking_constraint === 'van_only' ? 'Van only' : 'Standard vehicle access',
      dock: outlet.dock_type === 'street' ? 'Street unloading' : 'Rear dock', plannedArrival: ['05:15', '05:45', '06:15'][index],
      items: [
        { sku: 'DEMO-MILK', name: 'Fresh milk', expected: 4, temperature: 'Chilled' },
        { sku: 'DEMO-YOGURT', name: 'Yogurt', expected: 2, temperature: 'Chilled' },
        { sku: 'DEMO-EGGS', name: 'Eggs', expected: 2, temperature: 'Ambient' },
      ],
    };
  }),
};
