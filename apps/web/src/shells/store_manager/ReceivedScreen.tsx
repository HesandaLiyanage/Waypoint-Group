import { useAuth } from '../../context/AuthContext';
import { Button, Card } from '../../components/common';
import { Icon } from './icons';
import { go } from './navigation';
import type { ReceiptResult } from './receiptTypes';

// Full receipt page ("Order Received & Confirmed" in the Figma set).
export function ReceivedScreen({ r }: { r: ReceiptResult | null }) {
  const { currentUser } = useAuth();
  if (!r) return <div className="sm-page sm-narrow"><Card className="sm-empty"><h1 className="sm-h1-md">No receipt yet</h1><Button onClick={() => go('inbound')}>Go to inbound consignments</Button></Card></div>;
  return (
    <div className="sm-page sm-narrow">
      <Card className="sm-empty sm-done">
        <span className="sm-bigcheck"><Icon name="check" size={34} /></span>
        <p className="sm-eyebrow sm-eyebrow--accent">Receipt inbound transmitted</p>
        <h1 className="sm-h1-md">Order Received &amp; Confirmed</h1>
        <p className="sm-muted">The receiving docket has been electronically validated, signed, and ingested into the Waypoint distribution network.</p>
        <div className="sm-recgrid">
          <div><small>Order reference</small><strong>{r.orderId} <span className="sm-ver">Verified</span></strong><span className="sm-muted">Store Inbound Delivery Manifest</span></div>
          <div><small>Confirmation timestamp</small><strong>Confirmed today at {r.at}</strong><span className="sm-muted">Central Distribution Ledger (UTC+05:30)</span></div>
          <div><small>Receiving outlet</small><strong>{currentUser?.outlet_id} — Waypoint Fresh</strong></div>
        </div>
        <Button className="sm-wide" onClick={() => go('home')}><Icon name="archive" /> Back to home</Button>
      </Card>
      <div className="sm-three">
        <div className="sm-card sm-row"><span className="sm-iconbox sm-iconbox--sm"><Icon name="archive" /></span><div><small>Audit state</small><strong>Stock count synced</strong></div></div>
        <div className="sm-card sm-row"><span className="sm-iconbox sm-iconbox--sm"><Icon name="bell" /></span><div><small>Store manager alert</small><strong>Copy emailed to store</strong></div></div>
        <div className="sm-card sm-row"><span className="sm-iconbox sm-iconbox--sm"><Icon name="lock" /></span><div><small>Dock bay</small><strong>Unlocked for next shift</strong></div></div>
      </div>
    </div>
  );
}
