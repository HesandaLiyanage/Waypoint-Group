import { AlertBanner, Badge, Button, Card } from '../../components/common';
import { go } from './navigation';
import type { LiveConsignment } from './live';

// Deferral notices come from the dispatcher's recorded decision for the order: new date and reason.
export function DeferralScreen({ items, onSelect }: { items: LiveConsignment[]; escalated?: boolean; onEscalate?: () => void; onSelect: (id: string) => void }) {
  const deferred = items.filter((c) => c.status === 'deferred');
  return (
    <div className="sm-page sm-narrow">
      <div className="sm-heading sm-heading--tight"><div><p className="sm-eyebrow sm-eyebrow--accent">Deferral notices</p><h1 className="sm-h1-md">Orders moved to a later run</h1></div></div>
      {!deferred.length && <AlertBanner tone="success" title="None of your orders are deferred">Orders that cannot be delivered on their day appear here with the new date and the reason.</AlertBanner>}
      {deferred.map((c) => (
        <Card key={c.id} className="sm-card">
          <div className="sm-order-head"><div><p className="sm-eyebrow">Order {c.id}</p><h2>{c.summary}</h2></div><Badge tone="danger">Deferred</Badge></div>
          <div className="sm-info-grid sm-info-grid--two"><div><small>New date</small><strong>{c.window.replace('Moved to ', '')}</strong></div><div><small>Reason</small><strong>{c.note || 'Not recorded'}</strong></div></div>
          <p className="sm-muted">Originally for {c.deliveryDate}. Your order is kept; it is planned first on the new date if capacity allows.</p>
          <Button variant="secondary" onClick={() => { onSelect(c.id); go('track'); }}>View order</Button>
        </Card>
      ))}
    </div>
  );
}
