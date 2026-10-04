import { Badge, Button, Card } from '../../components/common';
import { Icon } from './icons';
import { go } from './navigation';
import type { Notice } from './storeData';
import type { LiveConsignment } from './live';

const label = (c: LiveConsignment) => (c.stopStatus === 'receipt_confirmed' ? 'Confirmed' : c.stopStatus === 'receipt_disputed' ? 'Disputed' : c.stopStatus === 'delivered_short' ? 'Received short' : c.status === 'deferred' ? 'Deferred' : c.status === 'delivered' ? 'Delivered' : c.stopStatus === 'arrived' ? 'Driver arrived' : c.eta ? 'On its way' : 'Ordered');

export function HomeScreen({ notices, items }: { notices: Notice[]; items: LiveConsignment[] }) {
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Colombo' }).format(new Date());
  return (
    <div className="sm-page">
      <div className="sm-heading">
        <div>
          <p className="sm-eyebrow"><span className="sm-dot" /> Live outlet operations</p>
          <h1>Today's Fulfillment <small>{today}</small></h1>
        </div>
        <div className="sm-heading-actions">
          <Button variant="secondary" onClick={() => go('inbound')}><Icon name="list" /> Inbound consignments</Button>
          <Button onClick={() => go('new-order')}><Icon name="plus" /> New order</Button>
        </div>
      </div>

      <div className="sm-two">
        {items.slice(0, 4).map((c) => (
          <Card key={c.id} className="sm-order sm-clickable" tabIndex={0} role="link" aria-label={`Open order ${c.id}`} onClick={() => go(c.status === 'deferred' ? 'deferral' : 'inbound')} onKeyDown={(e) => e.key === 'Enter' && go(c.status === 'deferred' ? 'deferral' : 'inbound')}>
            <div className="sm-order-head">
              <span className="sm-iconbox"><Icon name={c.skus.some((k) => k.temp === 'chilled') ? 'snow' : 'archive'} size={26} /></span>
              <div><p className="sm-eyebrow">Order {c.id}</p><h2>{c.summary || 'Order'}</h2></div>
              <Badge tone={c.status === 'deferred' ? 'danger' : c.status === 'delivered' ? 'success' : 'info'}>{label(c)}</Badge>
            </div>
            <dl className="sm-facts"><div><dt>Schedule</dt><dd>{c.window}</dd></div><div><dt>Vehicle</dt><dd>{c.vehicle ?? 'Not assigned yet'}</dd></div><div><dt>Units</dt><dd>{c.crates}</dd></div></dl>
            <p className="sm-statusline"><span>{c.note || (c.eta ? 'On its way' : 'Waiting for the plan')}</span><strong>{c.eta ?? ''}</strong></p>
          </Card>
        ))}
      </div>

      <div className="sm-section-head"><h2><Icon name="bell" /> Notifications</h2><span>{notices.filter((n) => n.unread).length} new updates</span></div>
      <ul className="sm-notices">
        {notices.map((n) => (
          <li key={n.id} className="sm-notice">
            <span className="sm-iconbox sm-iconbox--sm"><Icon name={n.icon} /></span>
            <div><strong>{n.title}</strong><p>{n.body}</p></div>
            <span className="sm-ago">{n.ago}</span><span className={`sm-unread ${n.unread ? 'on' : ''}`} aria-label={n.unread ? 'Unread' : 'Read'} />
          </li>
        ))}
      </ul>
    </div>
  );
}
