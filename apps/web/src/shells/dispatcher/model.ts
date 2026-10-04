// Dispatcher view model. Everything here is derived from server data (see live.ts); nothing is a fixture.
export type Order = {
  id: string; // human reference, e.g. ORD-20260622-008
  uid: string; // order UUID used in commands
  outlet: string;
  name: string;
  brand: string;
  district: string;
  temp: 'Chilled' | 'Ambient';
  kg: number;
  volume: number;
  skips: number;
  vanOnly: boolean;
  priority: boolean; // true when the outlet was skipped on a previous run
  trip: string | null; // trip UUID when assigned
  reason: string;
  nextDate: string;
  proposal: string;
  decisionNote: string;
  reviewed: boolean;
  source: 'planner' | 'dispatcher';
  late: boolean; // placed after the 16:00 cutoff
};
export type Trip = {
  id: string;
  code: string;
  vehicle: string;
  kind: 'Truck' | 'Van';
  temp: 'Chilled' | 'Ambient';
  brand: string;
  district: string;
  kg: number;
  volume: number;
  minutes: number;
  budget: number;
  fuelL: number;
  depart: string;
  eta: string;
  status: string;
  tripNo: number;
  stops: StopRow[];
};
export type StopRow = { id: string; orderUid: string; seq: number; eta: string; status: string; windowClose: string };
export type IssueRow = {
  id: string; kind: string; lineNo: number | null; tripId: string | null; stopId: string | null; orderUid: string | null;
  status: 'open' | 'ack' | 'resolved'; note: string; raisedRole: string; instruction: { note: string } | null; outcome: string;
};
export type Warning = { order: Order; reason: string };
export type CapacityPlan = { shift: number; reefer: number; ambient: number; note: string };
export type Instruction = { action: 'alternate' | 'wait' | 'reattempt' | 'return'; note: string; reviewTime: string };
export type PendingUser = { id: string; name: string; email: string; role: string; depot: string; outletId: string | null; phone: string; workId: string };
export type PlanInfo = { id: string; status: 'draft' | 'published'; version: number };
export type DispatchState = {
  depot: string;
  deliveryDate: string;
  operatingDates: string[];
  closed: boolean;
  generated: boolean;
  recorded: boolean;
  confirmed: boolean;
  lateCount: number;
  plan: PlanInfo | null;
  orders: Order[];
  trips: Trip[];
  issues: IssueRow[];
  warnings: Warning[];
  capacityPlans: Record<string, CapacityPlan>;
  pendingUsers: PendingUser[];
  vehicles: { id: string; kind: string; temp: string }[];
  audit: string[];
};
export type Action =
  | { type: 'close' | 'generate' | 'record' | 'confirm' }
  | { type: 'reassign'; id: string; trip: string }
  | { type: 'deferral'; id: string; reason: string; nextDate: string }
  | { type: 'defer'; id: string; reason: string; nextDate: string; note: string }
  | { type: 'review'; id: string; note: string; accepted: boolean }
  | { type: 'accept_shortfall'; stopId: string; lineNo: number; note: string }
  | { type: 'ack'; issueId: string }
  | { type: 'instruct'; issueId: string; instruction: Instruction; coordinated: boolean }
  | { type: 'resolve'; issueId: string; note: string; confirmed?: boolean }
  | { type: 'user_decision'; userId: string; decision: 'approve' | 'reject'; vehicleId?: string }
  | { type: 'capacity'; depot: string; plan: CapacityPlan; agreed?: boolean };

export const deferred = (s: DispatchState) => s.orders.filter((o) => !o.trip);
export function loadFor(orders: Order[], tripId: string) {
  return orders.filter((o) => o.trip === tripId).reduce((a, o) => ({ kg: a.kg + o.kg, volume: Number((a.volume + o.volume).toFixed(2)) }), { kg: 0, volume: 0 });
}
// Quick client-side hints for the reassign dialog. The server re-validates every rule (including time and fuel) and rejects violations.
export function compatibility(order: Order, trip: Trip, orders: Order[]): string[] {
  const load = loadFor(orders.filter((o) => o.id !== order.id), trip.id);
  return [
    order.brand !== trip.brand ? 'Different brand' : '',
    order.district !== trip.district ? 'Different district' : '',
    order.vanOnly && trip.kind !== 'Van' ? 'Van-only access' : '',
    order.temp === 'Chilled' && trip.temp !== 'Chilled' ? 'Refrigeration required' : '',
    load.kg + order.kg > trip.kg ? 'Weight capacity exceeded' : '',
    load.volume + order.volume > trip.volume ? 'Volume capacity exceeded' : '',
  ].filter(Boolean);
}
export const planWarnings = (s: DispatchState) => s.warnings;
export const validNextDate = (s: DispatchState, date: string) => date > s.deliveryDate && s.operatingDates.includes(date);
export function isReviewed(s: DispatchState, o: Order) {
  return o.reviewed && !!o.reason.trim() && validNextDate(s, o.nextDate) && (o.skips === 0 || o.decisionNote.trim().length >= 10);
}
export function canRecord(s: DispatchState) {
  return s.generated && !s.confirmed && deferred(s).every((o) => isReviewed(s, o));
}
export function canConfirm(s: DispatchState) {
  return s.generated && s.closed && !s.confirmed && !s.warnings.length && (!deferred(s).length || s.recorded);
}
