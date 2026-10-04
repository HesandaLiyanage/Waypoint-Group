import { AlertBanner, Badge, Button, Card } from '../../components/common';
import { Icon } from './icons';
import { go } from './navigation';
import type { LiveConsignment } from './live';

const STATE: Record<string, string> = { pending: 'On its way', arrived: 'Driver has arrived', delivered: 'Delivered, waiting for your confirmation', delivered_short: 'Delivered with a shortfall, waiting for your confirmation', receipt_confirmed: 'Receipt confirmed', receipt_disputed: 'Reported to dispatch', failed: 'Not delivered' };

// Everything shown here comes from the order and its published stop; nothing is estimated on this screen.
export function TrackScreen({ c, onConfirmReceipt }: { c: LiveConsignment; onConfirmReceipt: () => void }) {
  const state = c.stopStatus ? STATE[c.stopStatus] ?? c.stopStatus : 'Waiting for the dispatcher to publish the plan';
  const canAct = c.stopStatus === 'arrived' || c.stopStatus === 'delivered' || c.stopStatus === 'delivered_short';
  return (
    <div className="sm-page sm-narrow">
      <div className="sm-heading sm-heading--tight"><div><p className="sm-eyebrow sm-eyebrow--accent">Delivery tracking</p><h1 className="sm-h1-md">Order {c.id}</h1></div><Button variant="secondary" onClick={() => go('inbound')}>All orders</Button></div>
      <AlertBanner tone={c.stopStatus === 'arrived' ? 'warning' : 'info'} title={state}>{c.eta ? `${c.eta} · ` : ''}{c.window}</AlertBanner>
      <Card className="sm-card">
        <h3><Icon name="truck" /> Delivery</h3>
        <div className="sm-info-grid sm-info-grid--two">
          <div><small>Vehicle</small><strong>{c.vehicle ?? 'Not assigned yet'}</strong></div>
          <div><small>Schedule</small><strong>{c.window}</strong></div>
        </div>
      </Card>
      <Card className="sm-card">
        <h3>Items ordered <Badge tone="neutral">{c.crates} units</Badge></h3>
        <ul>{c.skus.map((k, i) => <li key={k.sku + i}>{k.name}: {k.qty}{c.received?.[i] ? ` · received ${c.received[i].qty}` : ''}</li>)}</ul>
      </Card>
      <div className="sm-actions"><Button disabled={!canAct} onClick={onConfirmReceipt}><Icon name="checkc" /> {c.stopStatus === 'arrived' ? 'Show receipt code' : 'Confirm receipt'}</Button></div>
    </div>
  );
}
