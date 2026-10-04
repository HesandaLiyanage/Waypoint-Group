import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import { useSync, type Workspace } from '../../context/SyncContext';
import type { Action, CapacityPlan, DispatchState, IssueRow, Order, PlanInfo, StopRow, Trip, Warning } from './model';

type Row = Record<string, any>;
const HH = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Colombo' });
const clock = (iso?: string | null) => (iso ? HH.format(new Date(iso)) : '');
const colomboDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(iso));
const colomboMinutes = (iso: string) => {
  const [h, m] = clock(iso).split(':').map(Number);
  return h * 60 + m;
};
const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

const REASON_LABELS: Record<string, string> = {
  NEED_REEFER: 'Refrigeration required',
  VAN_ONLY: 'Outlet access restriction',
  MALL_WINDOW: 'Delivery window',
  WINDOW_LATE: 'Delivery window',
  WINDOW_INFEASIBLE: 'Delivery window',
};
const reasonLabel = (code: string) => REASON_LABELS[code] ?? 'Fleet capacity';

// Pure derivation of everything the dispatcher screens show, from one workspace snapshot.
export function buildState(
  ws: Workspace,
  depot: string,
  skipped: Record<string, number>,
  local: Record<string, Partial<Order>>,
  flags: { closed: boolean; lateCount: number; warnings: { code: string; message: string; order_id?: string; trip_id?: string }[]; audit: string[] }
): DispatchState {
  const today = colomboDate(ws.server_time);
  const operatingDates: string[] = ws.calendar.filter((d: Row) => d.is_operating === 1).map((d: Row) => String(d.date).slice(0, 10));
  const deliveryDate = operatingDates.find((d) => d > today) ?? today;
  const outlets = new Map<string, Row>(ws.outlets.map((o: Row) => [o.outlet_id, o]));
  const vehicles = new Map<string, Row>(ws.vehicles.map((v: Row) => [v.vehicle_id, v]));

  const plans = ws.plans.filter((p: Row) => p.depot === depot && String(p.plan_date).slice(0, 10) === deliveryDate && p.status !== 'superseded');
  const planRow = plans.sort((a: Row, b: Row) => b.version - a.version)[0];
  const plan: PlanInfo | null = planRow ? { id: planRow.id, status: planRow.status, version: planRow.version } : null;

  const stopsByTrip = new Map<string, StopRow[]>();
  const tripOfOrder = new Map<string, string>();
  for (const s of ws.stops.filter((s: Row) => plan && s.plan_id === plan.id).sort((a: Row, b: Row) => a.seq - b.seq)) {
    tripOfOrder.set(s.order_id, s.trip_id);
    const list = stopsByTrip.get(s.trip_id) ?? [];
    list.push({ id: s.id, orderUid: s.order_id, seq: s.seq, eta: clock(s.eta), status: s.status, windowClose: String(s.window_close).slice(0, 5) });
    stopsByTrip.set(s.trip_id, list);
  }
  const trips: Trip[] = ws.trips
    .filter((t: Row) => plan && t.plan_id === plan.id)
    .map((t: Row): Trip => {
      const v = vehicles.get(t.vehicle_id) ?? {};
      const stops = stopsByTrip.get(t.id) ?? [];
      return {
        id: t.id, code: `${t.vehicle_id} · trip ${t.trip_no}`, vehicle: t.vehicle_id,
        kind: v.type === 'van' ? 'Van' : 'Truck', temp: v.temp === 'reefer' ? 'Chilled' : 'Ambient',
        brand: t.brand, district: t.district, kg: Number(v.weight_cap_kg ?? 0), volume: Number(v.volume_cap_m3 ?? 0),
        minutes: Number(t.minutes?.total_trip_min ?? 0), budget: Number(t.minutes?.budget_limit_min ?? 0),
        fuelL: Number((Number(t.est_fuel_ml) / 1000).toFixed(1)), depart: clock(t.planned_depart),
        eta: stops.length ? stops[stops.length - 1].eta : '', status: t.status, tripNo: t.trip_no, stops,
      };
    })
    .sort((a: Trip, b: Trip) => a.depart.localeCompare(b.depart) || a.vehicle.localeCompare(b.vehicle));

  const deferralByOrder = new Map<string, Row>(ws.deferrals.filter((d: Row) => plan && d.plan_id === plan.id).map((d: Row) => [d.order_id, d]));
  const orders: Order[] = ws.orders
    .filter((o: Row) => String(o.delivery_date).slice(0, 10) === deliveryDate && outlets.get(o.outlet_id)?.depot === depot)
    .map((o: Row): Order => {
      const outlet = outlets.get(o.outlet_id) ?? {};
      const d = deferralByOrder.get(o.id);
      const manual = d?.decided_by === 'dispatcher';
      const manualNote: string = d?.explanation?.reason ?? '';
      const [manualReason, ...rest] = manualNote.split(': ');
      const skips = skipped[o.outlet_id] ?? 0;
      const base: Order = {
        id: o.ref, uid: o.id, outlet: o.outlet_id, name: `${outlet.brand ?? o.brand} · ${outlet.district ?? ''}`,
        brand: o.brand, district: outlet.district ?? '', temp: o.temp_requirement === 'chilled' ? 'Chilled' : 'Ambient',
        kg: Number((Number(o.total_weight_g) / 1000).toFixed(1)), volume: Number((Number(o.total_volume_ul) / 1e9).toFixed(2)),
        skips, vanOnly: outlet.parking_constraint === 'van_only', priority: skips > 0,
        trip: tripOfOrder.get(o.id) ?? null,
        reason: d ? (manual ? manualReason : reasonLabel(d.reason_code)) : '',
        nextDate: d ? String(d.carried_to).slice(0, 10) : addDays(deliveryDate, 1),
        proposal: d && !manual ? `${d.reason_code}: ${JSON.stringify(d.explanation?.details ?? d.reason_params ?? {})}` : '',
        decisionNote: manual ? rest.join(': ') : '', reviewed: manual, source: manual ? 'dispatcher' : 'planner',
        late: !!o.is_late,
      };
      return { ...base, ...(base.trip ? {} : local[o.id]) };
    })
    .sort((a: Order, b: Order) => b.skips - a.skips || a.id.localeCompare(b.id));

  const byUid = new Map(orders.map((o) => [o.uid, o]));
  const tripFirstOrder = (tripId?: string) => trips.find((t) => t.id === tripId)?.stops.map((s) => byUid.get(s.orderUid)).find(Boolean);
  const warnings: Warning[] = flags.warnings
    .map((w) => ({ order: (w.order_id && byUid.get(w.order_id)) || tripFirstOrder(w.trip_id), reason: w.message }))
    .filter((w): w is Warning => !!w.order);

  const issues: IssueRow[] = ws.issues
    .filter((i: Row) => ['open', 'ack', 'resolved'].includes(i.status))
    .map((i: Row): IssueRow => ({
      id: i.id, kind: i.kind, tripId: i.trip_id ?? null, stopId: i.stop_id ?? null, orderUid: i.order_id ?? null, status: i.status,
      note: i.detail?.note ?? i.detail?.issue_instruction?.note ?? '', raisedRole: i.raised_role,
      instruction: i.detail?.issue_instruction ? { note: i.detail.issue_instruction.note } : null,
      outcome: i.detail?.issue_resolve?.note ?? '',
    }));

  const capacityPlans: Record<string, CapacityPlan> = {};
  for (const c of [...ws.capacity].reverse()) {
    const m = Object.fromEntries(String(c.action).split(';').map((p) => p.split(':')));
    capacityPlans[c.depot] = { shift: Number(m.shift ?? 0), reefer: Number(m.reefer ?? 0), ambient: Number(m.ambient ?? 0), note: c.note };
  }

  const cutoffPassed = Date.parse(ws.server_time) >= Date.parse(`${addDays(deliveryDate, -1)}T16:00:00+05:30`);
  const deferredOrders = orders.filter((o) => !o.trip);
  return {
    depot, deliveryDate, operatingDates, plan, orders, trips, issues, warnings, capacityPlans,
    pendingUsers: (ws.pending_users ?? []).map((p: Row) => ({ id: p.id, name: p.name, email: p.email, role: p.role, depot: p.depot ?? '', outletId: p.outlet_id ?? null, phone: p.phone ?? '', workId: p.work_id ?? '' })),
    vehicles: ws.vehicles.filter((v: Row) => v.depot === depot).map((v: Row) => ({ id: v.vehicle_id, kind: v.type, temp: v.temp })),
    closed: flags.closed || cutoffPassed || !!plan, generated: !!plan, confirmed: plan?.status === 'published',
    recorded: !!plan && deferredOrders.every((o) => o.source === 'dispatcher'), lateCount: flags.lateCount, audit: flags.audit,
  };
}

export function useLiveDispatch() {
  const { currentUser } = useAuth();
  const { workspace, workspaceError, refresh } = useSync();
  const depot = currentUser?.depot ?? 'Peliyagoda';
  const [skipped, setSkipped] = useState<Record<string, number>>({});
  const [local, setLocal] = useState<Record<string, Partial<Order>>>({});
  const [closedLocal, setClosedLocal] = useState(false);
  const [lateCount, setLateCount] = useState(0);
  const [audit, setAudit] = useState<string[]>([]);
  const [violations, setViolations] = useState<{ code: string; message: string; order_id?: string; trip_id?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = useMemo(
    () => (workspace ? buildState(workspace, depot, skipped, local, { closed: closedLocal, lateCount, warnings: violations, audit }) : null),
    [workspace, depot, skipped, local, closedLocal, lateCount, violations, audit]
  );

  const planKey = state?.plan ? `${state.plan.id}:${state.plan.version}:${state.plan.status}` : '';
  useEffect(() => {
    let live = true;
    request<{ outlet_id: string; skip_streak: number }[]>(`/dispatch/skipped-outlets?depot=${encodeURIComponent(depot)}`)
      .then((rows) => live && setSkipped(Object.fromEntries((rows ?? []).map((r) => [r.outlet_id, r.skip_streak]))))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [depot, planKey]);
  useEffect(() => {
    if (!state?.plan || state.plan.status !== 'draft') return setViolations([]);
    let live = true;
    request<{ violations?: { severity: string; code: string; message: string; order_id?: string; trip_id?: string }[] }>(`/plans/${state.plan.id}/validate`, { method: 'POST', body: '{}' })
      .then((r) => live && setViolations((r.violations ?? []).filter((v) => v.severity === 'hard')))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const note = useCallback((entry: string) => setAudit((a) => [...a, entry]), []);
  const command = useCallback(
    (body: Record<string, unknown>) => request('/workflow/commands', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }),
    []
  );

  const dispatch = useCallback(
    (a: Action) => {
      if (!state) return;
      const orderBy = (ref: string) => state.orders.find((o) => o.id === ref);
      // Local edits are keyed by the order UUID (what buildState reads); screens refer to orders by their reference.
      const patch = (ref: string, p: Partial<Order>) => {
        const uid = orderBy(ref)?.uid;
        if (uid) setLocal((l) => ({ ...l, [uid]: { ...l[uid], ...p } }));
      };
      const run = async () => {
        switch (a.type) {
          case 'deferral': patch(a.id, { reason: a.reason, nextDate: a.nextDate, reviewed: false }); return;
          case 'review': patch(a.id, { decisionNote: a.note, reviewed: a.accepted }); return;
          case 'close': {
            const r = await request<{ late_orders_count?: number }>('/dispatch/close-orders', { method: 'POST', body: JSON.stringify({ depot, date: state.deliveryDate }) });
            setClosedLocal(true);
            setLateCount(r.late_orders_count ?? 0);
            note(`Order queue closed for ${state.deliveryDate}.`);
            break;
          }
          case 'generate':
            await request('/plans/generate', { method: 'POST', body: JSON.stringify({ depot, plan_date: state.deliveryDate, strategy: 'fairness_first' }) });
            setLocal({});
            note('Draft generated: previously skipped outlets first, then access needs; unassigned orders need review.');
            break;
          case 'reassign': {
            const o = orderBy(a.id);
            if (!o) return;
            await command({ action: 'reassign', order_id: o.uid, trip_id: a.trip });
            note(`${o.id} reassigned.`);
            break;
          }
          case 'defer': {
            const o = orderBy(a.id);
            if (!o) return;
            await command({ action: 'defer', order_id: o.uid, date: a.nextDate, note: `${a.reason}: ${a.note}` });
            note(`${o.id} deferred by dispatcher: ${a.reason}.`);
            break;
          }
          case 'record':
            for (const o of state.orders.filter((x) => !x.trip)) {
              await command({ action: 'defer', order_id: o.uid, date: o.nextDate, note: `${o.reason}: ${o.decisionNote.trim() || o.reason}` });
            }
            note('Deferral reasons and next dates recorded.');
            break;
          case 'confirm':
            if (!state.plan) return;
            await request(`/plans/${state.plan.id}/publish`, { method: 'POST', body: '{}', headers: { 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${state.plan.version}"` } });
            note('Plan published to loaders, drivers and stores.');
            break;
          case 'ack': await command({ action: 'issue_ack', issue_id: a.issueId }); note('Delivery incident acknowledged.'); break;
          case 'instruct':
            if (!a.coordinated) return;
            await command({ action: 'issue_instruction', issue_id: a.issueId, note: `${a.instruction.action} (review ${a.instruction.reviewTime} LK): ${a.instruction.note}` });
            note(`Instruction recorded: ${a.instruction.action}.`);
            break;
          case 'resolve':
            if (!a.confirmed) return;
            await command({ action: 'issue_resolve', issue_id: a.issueId, note: a.note });
            note('Driver/outlet outcome confirmed; incident closed.');
            break;
          case 'user_decision':
            await command({ action: 'user_decision', user_id: a.userId, status: a.decision, vehicle_id: a.vehicleId });
            note(a.decision === 'approve' ? 'Registration approved.' : 'Registration rejected.');
            break;
          case 'capacity':
            await command({ action: 'capacity', depot: a.depot, date: state.deliveryDate, status: `shift:${a.plan.shift};reefer:${a.plan.reefer};ambient:${a.plan.ambient}`, note: a.plan.note });
            note(`Capacity action plan saved for ${a.depot}; resources not reserved.`);
            break;
        }
        await refresh();
      };
      setBusy(true);
      setError(null);
      run().catch((e) => setError(e instanceof Error ? e.message : 'Action failed')).finally(() => setBusy(false));
    },
    [state, depot, command, refresh, note]
  );

  return { state, dispatch, busy, error, clearError: () => setError(null), loadError: workspaceError, colomboMinutes };
}
