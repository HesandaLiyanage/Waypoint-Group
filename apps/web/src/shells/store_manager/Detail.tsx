import { Badge, Button } from '../../components/common';
import { Icon } from './icons';
import type { Consignment, Sku } from './storeData';

export const DISPATCH_PHONE = '+94 11 284 9000';

export function SkuTable({ skus, status }: { skus: Sku[]; status: 'passed' | 'transit' }) {
  return (
    <div className="sm-table-wrap">
      <table className="sm-table">
        <thead><tr><th>Product & SKU</th><th>Storage telemetry</th><th>Crates & qty</th><th>{status === 'passed' ? 'Audit' : 'Status'}</th></tr></thead>
        <tbody>
          {skus.map((s) => (
            <tr key={s.sku}>
              <td><strong>{s.name}</strong><small>{s.sku}</small></td>
              <td>{s.telemetry}</td>
              <td><strong>{s.crates} Crates</strong><small>{s.qty}</small></td>
              <td>{status === 'passed' ? <Badge tone="success">✓ Passed</Badge> : <Badge tone="info">In transit</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CallDispatcher() {
  return <a className="sm-call" href={`tel:${DISPATCH_PHONE.replace(/\s/g, '')}`}><Icon name="phone" size={22} /> Call dispatcher ({DISPATCH_PHONE})</a>;
}

export function InboundDetail({ c, onTrack, onConfirmReceipt, onDeferral }: { c: Consignment; onTrack: () => void; onConfirmReceipt: () => void; onDeferral: () => void }) {
  if (c.status === 'deferred') {
    return (
      <div className="sm-detail">
        <div className="sm-detail-head"><div><h2>Order {c.id} <Badge tone="warning">Deferred</Badge></h2><p className="sm-muted">{c.note}</p></div></div>
        <p className="sm-muted">This order was moved to the next run. Read the dispatcher's reason and the new slot.</p>
        <Button onClick={onDeferral}>View deferral notice</Button>
        <CallDispatcher />
      </div>
    );
  }
  if (c.status === 'delivered') {
    return (
      <div className="sm-detail">
        <div className="sm-detail-head"><div><h2>Order {c.id} <Badge tone="success">Delivered</Badge></h2><p className="sm-muted">{c.window} · {c.crates} crates · {c.summary}</p></div></div>
        <div className="sm-info-grid"><div><small>Receipt</small><strong>Signed</strong></div><div><small>Manifest</small><strong>{c.note}</strong></div><div><small>Crates</small><strong>{c.crates}</strong></div></div>
        <CallDispatcher />
      </div>
    );
  }
  return (
    <div className="sm-detail">
      <div className="sm-detail-head">
        <div><h2>Order Detail — {c.id} <Badge tone="info"><Icon name="truck" size={14} /> Out for delivery</Badge></h2><p className="sm-muted">{c.note}</p></div>
        <Button variant="secondary" onClick={() => window.print()}><Icon name="print" /> Print manifest</Button>
      </div>
      <div className="sm-telemetry">
        <div className="sm-telemetry-top"><strong>Live dispatch telemetry • VEH014 (Refrig 4T)</strong><Badge tone="info"><Icon name="snow" size={14} /> Chamber +3.1°C active</Badge></div>
        <p className="sm-muted">Driver: K. Fernando · Speed: 38 km/h</p>
        <ol className="sm-steps">
          <li className="done"><span><Icon name="check" size={16} /></span><strong>Peliyagoda Hub</strong><small>Departed 5:40 AM</small></li>
          <li className="done"><span><Icon name="check" size={16} /></span><strong>St. Anthony's Super</strong><small>Cleared 6:22 AM</small></li>
          <li className="next"><span><Icon name="route" size={16} /></span><strong>OUT047 • Waypoint Fresh</strong><small>Next stop (ETA 6:48 AM)</small></li>
        </ol>
      </div>
      <div className="sm-info-grid">
        <div><small>Cutoff & order time</small><strong>Yesterday, 3:42 PM</strong><em>Compliant before 4 PM</em></div>
        <div><small>Dispatch hub</small><strong>Peliyagoda Hub</strong><span className="sm-muted">Dock Bay 12 · Zone 04</span></div>
        <div><small>Depot security seal</small><strong>#LK-PEL-88412</strong><span className="sm-muted">Depot gate: Dock B</span></div>
      </div>
      <p className="sm-section-title">Manifest SKUs ({c.skus.length} SKUs • {c.crates} crates) <Badge tone="success"><Icon name="shield" size={14} /> Cold chain verified</Badge></p>
      <SkuTable skus={c.skus} status="passed" />
      <div className="sm-actions"><Button onClick={onTrack}><Icon name="route" /> Track delivery (VEH014)</Button><Button variant="secondary" onClick={onConfirmReceipt}><Icon name="checkc" /> Confirm receipt</Button></div>
      <CallDispatcher />
    </div>
  );
}
