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
        </div>
    );
  }
  if (c.status === 'delivered') {
    return (
      <div className="sm-detail">
        <div className="sm-detail-head"><div><h2>Order {c.id} <Badge tone="success">Delivered</Badge></h2><p className="sm-muted">{c.window} · {c.crates} crates · {c.summary}</p></div></div>
        <div className="sm-info-grid"><div><small>Receipt</small><strong>Signed</strong></div><div><small>Manifest</small><strong>{c.note}</strong></div><div><small>Crates</small><strong>{c.crates}</strong></div></div>
        </div>
    );
  }
  return (
    <div className="sm-detail">
      <div className="sm-detail-head">
        <div><h2>Order Detail — {c.id} <Badge tone="info"><Icon name="truck" size={14} /> {c.eta ? 'Out for delivery' : 'Ordered'}</Badge></h2><p className="sm-muted">{c.note}</p></div>
        <Button variant="secondary" onClick={() => window.print()}><Icon name="print" /> Print manifest</Button>
      </div>
      <div className="sm-info-grid">
        <div><small>Vehicle</small><strong>{c.vehicle ?? 'Not assigned yet'}</strong></div>
        <div><small>Schedule</small><strong>{c.window}</strong></div>
        <div><small>Expected arrival</small><strong>{c.eta ?? 'Set when the plan is published'}</strong></div>
      </div>
      <p className="sm-section-title">Manifest SKUs ({c.skus.length} SKUs • {c.crates} crates)</p>
      <SkuTable skus={c.skus} status="passed" />
      <div className="sm-actions"><Button onClick={onTrack}><Icon name="route" /> Track delivery</Button><Button variant="secondary" onClick={onConfirmReceipt}><Icon name="checkc" /> Confirm receipt</Button></div>
    </div>
  );
}
