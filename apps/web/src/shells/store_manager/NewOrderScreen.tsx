import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Modal, SelectField } from '../../components/common';
import { Icon } from './icons';
import { go } from './navigation';
import { request } from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';

const USED = 0;
const LIMIT = 50; // single-order size limit in this form

// Business time comes from the server clock, not the browser, so the 16:00 cutoff matches what the planner enforces.
function colomboMinutes(iso: string) {
  const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Colombo' }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
}

export function NewOrderScreen({ onSubmitted }: { onSubmitted: (ref: string, itemName: string, qty: number, afterCutoff: boolean) => void }) {
  const { workspace } = useSync();
  const { currentUser } = useAuth();
  const now = colomboMinutes(workspace?.server_time ?? new Date().toISOString());
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(workspace?.server_time ?? Date.now()));
  const nextDays: string[] = (workspace?.calendar ?? []).filter((d: any) => d.is_operating === 1 && String(d.date).slice(0, 10) > today).slice(0, 2).map((d: any) => String(d.date).slice(0, 10));
  const catalog = (workspace?.catalog ?? []).filter((c: any) => c.brand === 'Fresh').map((c: any) => ({ id: c.sku, name: c.name_en, sku: c.sku, title: c.name_en, blurb: `${c.unit_weight_kg} kg and ${c.unit_volume_m3} m³ per unit`, tag: c.temp_requirement === 'chilled' ? 'Chilled' : 'Ambient', chill: c.temp_requirement === 'chilled' ? 'Chilled' : 'Ambient' }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const left = 16 * 60 - now;
  const afterCutoff = left <= 0;
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(6);
  const [day, setDay] = useState('tomorrow');
  const [done, setDone] = useState<{ ref: string } | null>(null);
  const item = catalog.find((c: any) => c.id === itemId) ?? catalog[0];
  if (!item || nextDays.length === 0) return <div className="sm-page sm-narrow"><p>Loading the catalog and calendar…</p></div>;
  const projected = USED + qty;
  const over = projected > LIMIT;
  const days: Record<string, string> = { tomorrow: `${nextDays[0]}, morning run`, after: `${nextDays[1] ?? nextDays[0]}, morning run` };
  const dayLabel = afterCutoff && day === 'tomorrow' ? days.after : days[day];
  const countdown = useMemo(() => (afterCutoff ? 'Orders closed at 4:00 PM — next run' : `Orders close at 4:00 PM — ${Math.floor(left / 60)}h ${String(left % 60).padStart(2, '0')}m left`), [left, afterCutoff]);

  // An order placed after the cutoff is booked for the following operating day, not silently lost in the same run.
  const deliveryDate = afterCutoff && day === 'tomorrow' ? nextDays[1] ?? nextDays[0] : day === 'tomorrow' ? nextDays[0] : nextDays[1] ?? nextDays[0];
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await request<{ orders?: { ref: string }[] }>('/orders', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), outlet_id: currentUser?.outlet_id, delivery_date: deliveryDate, items: [{ sku: item.sku, qty }], source: 'app' }) });
      setDone({ ref: res.orders?.[0]?.ref ?? 'Order placed' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Order failed'); } finally { setBusy(false); }
  };
  return (
    <div className="sm-page sm-narrow">
      <div className="sm-heading sm-heading--tight">
        <div><p className="sm-eyebrow sm-eyebrow--accent">Waypoint Fresh stock replenishment · Store receiving manifest</p><h1 className="sm-h1-md">Store Replenishment Order</h1></div>
        <div className="sm-location"><Icon name="shield" /> <span><small>Active location</small><strong>{currentUser?.outlet_id} — Waypoint Fresh</strong></span></div>
      </div>

      <div className={`sm-banner ${afterCutoff ? 'is-late' : ''}`} role="status">
        <span className="sm-iconbox sm-iconbox--dark"><Icon name="clock" size={26} /></span>
        <div><p className="sm-eyebrow sm-eyebrow--accent">Same-day dispatch window <Badge tone="info">Priority cycle</Badge></p><strong>{countdown}</strong></div>
        <span className="sm-tminus"><span className="sm-dot" /> {afterCutoff ? 'CLOSED' : `T-MINUS ${left} MIN`}</span>
      </div>

      <div className="sm-split">
        <Card className="sm-form">
          <div className="sm-form-head"><div><p className="sm-eyebrow">Single-brand allocation</p><h2>Fresh Replenishment Intake</h2></div><Badge tone="neutral">Brand: Fresh Only</Badge></div>
          <SelectField label="Select brand item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {catalog.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <p className="sm-hint">All Fresh dairy & produce shipments are chilled at -2°C to 4°C throughout transport.</p>

          <div className="sm-qty-head"><span className="sm-label">Quantity (units)</span><span className="sm-hint">Max single dispatch: 50 crates</span></div>
          <div className="sm-qty">
            <button type="button" aria-label="Decrease crates" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <div><strong>{qty}</strong><small>Crates required</small></div>
            <button type="button" aria-label="Increase crates" onClick={() => setQty((q) => Math.min(LIMIT, q + 1))}>+</button>
          </div>
          <div className="sm-presets" role="group" aria-label="Quick quantity">
            {[3, 6, 12, 24].map((n) => <button key={n} type="button" aria-pressed={qty === n} onClick={() => setQty(n)}>{n} Crates</button>)}
          </div>

          <SelectField label="Delivery day" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="tomorrow">{days.tomorrow}</option>
            <option value="after">{days.after}</option>
          </SelectField>

          <div className="sm-policy"><Icon name="info" size={22} /><div><strong>Dockside scheduling policy</strong><p>Orders submitted after 4:00 PM will be scheduled for the following run. You will still receive confirmation and your place in the hub staging queue is preserved.</p></div></div>
          {error && <p className="sm-error" role="alert">{error}</p>}
          <Button className="sm-submit" disabled={busy} onClick={() => void submit()}><Icon name="bolt" /> Submit order</Button>
          <p className="sm-fine">Transmits directly to Colombo Central Hub dispatch (DC-01)</p>
        </Card>

        <aside className="sm-side">
          <Card className="sm-product">
            <div className="sm-product-img"><Icon name="snow" size={56} /><span className="sm-chip-dark">❄ {item.chill}</span></div>
            <div className="sm-product-body">
              <p className="sm-eyebrow sm-eyebrow--accent">Catalog SKU {item.sku} <Badge tone="success">{item.tag}</Badge></p>
              <h3>{item.title}</h3><p>{item.blurb}</p>
              <div className={`sm-alloc ${over ? 'is-over' : ''}`}><div><span>Store allocation limit</span><strong>{projected} / {LIMIT} crates</strong></div><div className="sm-alloc-bar"><span style={{ width: `${Math.min(100, (projected / LIMIT) * 100)}%` }} /></div>{over && <small>Over allocation, dispatcher will review.</small>}</div>
            </div>
          </Card>
          <Card className="sm-workflow">
            <p className="sm-eyebrow">Replenishment workflow</p>
            <ol>
              <li><span className="on">1</span><div><strong>Order entry</strong><small>Confirmed by DC staging controller</small></div></li>
              <li><span>2</span><div><strong>4:00 PM order cutoff</strong><small>Automatic route consolidation</small></div></li>
              <li><span>3</span><div><strong>Dock inbound delivery</strong><small>Arrival & temp integrity check at OUT047</small></div></li>
            </ol>
          </Card>
        </aside>
      </div>

      <Modal open={!!done} onClose={() => setDone(null)} title="Order submitted" description={done ? `${done.ref} · ${qty} crates · ${item.name}` : ''}
        footer={<Button onClick={() => { if (done) onSubmitted(done.ref, item.name, qty, afterCutoff); setDone(null); go('home'); }}>Back to today's fulfillment</Button>}>
        <p className="sm-modal-text">Confirmed for <strong>{dayLabel}</strong>. {afterCutoff ? 'It was placed after the 4:00 PM cutoff, so it joins the following run.' : 'It will be planned at the 4:00 PM cutoff.'} You will be told here if it is deferred.</p>
      </Modal>
    </div>
  );
}
