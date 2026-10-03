import { Badge, Button, Card } from '../../components/common';
import { Icon } from './icons';
import { go } from './navigation';
import type { Notice } from './storeData';

export function HomeScreen({ notices, dryStatus }: { notices: Notice[]; dryStatus: 'confirmed' | 'delivered' }) {
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Colombo' }).format(new Date());
  return (
    <div className="sm-page">
      <div className="sm-heading">
        <div>
          <p className="sm-eyebrow"><span className="sm-dot" /> Live outlet operations · Shift 01 (06:00 – 15:00)</p>
          <h1>Today's Fulfillment <small>{today}</small></h1>
        </div>
        <div className="sm-heading-actions">
          <Button variant="secondary" onClick={() => go('inbound')}><Icon name="list" /> Inbound consignments</Button>
          <Button onClick={() => go('new-order')}><Icon name="plus" /> New order</Button>
        </div>
      </div>

      <div className="sm-two">
        <Card className="sm-order sm-clickable" tabIndex={0} role="link" aria-label="Open dry order" onClick={() => go('inbound')} onKeyDown={(e) => e.key === 'Enter' && go('inbound')}>
          <div className="sm-order-head">
            <span className="sm-iconbox"><Icon name="archive" size={26} /></span>
            <div><p className="sm-eyebrow">Manifest DRY-8841</p><h2>Dry order</h2></div>
            <Badge tone="success">{dryStatus === 'delivered' ? 'Delivered' : 'Confirmed'}</Badge>
          </div>
          <dl className="sm-facts"><div><dt>Dock window</dt><dd>11:30 — 12:45</dd></div><div><dt>Carrier unit</dt><dd>Fleet Truck 08 • Staging Bay 3</dd></div><div><dt>Total volume</dt><dd>142 Crates (Ambient)</dd></div></dl>
          <p className="sm-statusline ok"><span><Icon name="checkc" /> On schedule for midday dock</span><strong>ETA ~48m</strong></p>
        </Card>
        <Card className="sm-order sm-clickable" tabIndex={0} role="link" aria-label="Open deferral notice for chilled order" onClick={() => go('deferral')} onKeyDown={(e) => e.key === 'Enter' && go('deferral')}>
          <div className="sm-order-head">
            <span className="sm-iconbox"><Icon name="snow" size={26} /></span>
            <div><p className="sm-eyebrow">Manifest CHL-2094</p><h2>Chilled order</h2></div>
            <Badge tone="danger">Deferred</Badge>
          </div>
          <dl className="sm-facts"><div><dt>Revised dock window</dt><dd>14:15 — 15:00</dd></div><div><dt>Cold-chain monitor</dt><dd className="sm-good">+2.4°C (Nominal Reef)</dd></div><div><dt>Hub route</dt><dd>Central Cold Hub DC-2</dd></div></dl>
          <p className="sm-statusline bad"><span><Icon name="clock" /> Secondary route slot confirmed</span><strong>Rescheduled +1h 15m</strong></p>
        </Card>
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
