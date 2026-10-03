import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Modal, SelectField } from '../../components/common';
import { Icon } from './icons';
import { go } from './navigation';
import { catalog } from './storeData';

const USED = 38; // crates already allocated to this store
const LIMIT = 50;

function colomboMinutes() {
  const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Colombo' }).formatToParts(new Date());
  return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
}

export function NewOrderScreen({ onSubmitted }: { onSubmitted: (ref: string, itemName: string, qty: number, afterCutoff: boolean) => void }) {
  const [now, setNow] = useState(colomboMinutes);
  useEffect(() => { const t = window.setInterval(() => setNow(colomboMinutes()), 30000); return () => window.clearInterval(t); }, []);
  const left = 16 * 60 - now;
  const afterCutoff = left <= 0;
  const [itemId, setItemId] = useState(catalog[0].id);
  const [qty, setQty] = useState(6);
  const [day, setDay] = useState('tomorrow');
  const [done, setDone] = useState<{ ref: string } | null>(null);
  const item = catalog.find((c) => c.id === itemId)!;
  const projected = USED + qty;
  const over = projected > LIMIT;
  const days: Record<string, string> = { tomorrow: 'Tomorrow, Morning Run (05:30 AM – 08:00 AM)', after: 'Day after tomorrow, Morning Run (05:30 AM – 08:00 AM)' };
  const dayLabel = afterCutoff && day === 'tomorrow' ? days.after : days[day];
  const countdown = useMemo(() => (afterCutoff ? 'Orders closed at 4:00 PM — next run' : `Orders close at 4:00 PM — ${Math.floor(left / 60)}h ${String(left % 60).padStart(2, '0')}m left`), [left, afterCutoff]);

  const submit = () => {
    const ref = `ORD00${92400 + Math.floor(Math.random() * 500)}`;
    setDone({ ref });
  };
  return (
    <div className="sm-page sm-narrow">
      <div className="sm-heading sm-heading--tight">
        <div><p className="sm-eyebrow sm-eyebrow--accent">Waypoint Fresh stock replenishment · Store receiving manifest</p><h1 className="sm-h1-md">Store Replenishment Order</h1></div>
        <div className="sm-location"><Icon name="shield" /> <span><small>Active location</small><strong>OUT047 — Waypoint Fresh</strong></span></div>
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
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <p className="sm-hint">All Fresh dairy & produce shipments are chilled at -2°C to 4°C throughout transport.</p>

          <div className="sm-qty-head"><span className="sm-label">Crate quantity</span><span className="sm-hint">Max single dispatch: 50 crates</span></div>
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
          <Button className="sm-submit" onClick={submit}><Icon name="bolt" /> Submit order</Button>
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
