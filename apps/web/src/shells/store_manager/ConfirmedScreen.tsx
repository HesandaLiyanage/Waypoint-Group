import { Button, Card } from '../../components/common';
import { Icon } from './icons';
import { go } from './navigation';
import { issueLabel, type ReceiptResult } from './receiptTypes';

// One screen for both outcomes: "Delivery confirmed" and "Issue reported".
export function ConfirmedScreen({ r }: { r: ReceiptResult | null }) {
  if (!r) {
    return <div className="sm-page sm-narrow"><Card className="sm-empty"><Icon name="box" size={40} /><h1 className="sm-h1-md">No receipt yet</h1><p className="sm-muted">Confirm a delivery from the Inbound list first.</p><Button onClick={() => go('inbound')}>Go to inbound consignments</Button></Card></div>;
  }
  const issue = r.kind === 'issue';
  return (
    <div className="sm-page sm-narrow">
      <Card className="sm-empty sm-done">
        <span className={`sm-bigcheck ${issue ? 'warn' : ''}`}><Icon name={issue ? 'alert' : 'check'} size={34} /></span>
        <h1 className="sm-h1-md">{issue ? 'Issue reported' : 'Delivery confirmed'}</h1>
        <p className="sm-muted">{issue ? 'We have sent your report to the dispatch team.' : 'Thanks. Your receipt has been logged.'}</p>
        <div className="sm-chips"><span className="sm-chip"><Icon name="list" size={14} /> Manifest {r.orderId}</span>{issue && r.issue && <span className="sm-chip"><Icon name="alert" size={14} /> Issue type: {issueLabel[r.issue]}</span>}<span className="sm-chip"><Icon name="clock" size={14} /> {r.at}</span></div>
        <Button className="sm-wide" onClick={() => go('home')}><Icon name="archive" /> Back to home</Button>
      </Card>
      <div className="sm-two">
        {issue ? (<>
          <div className="sm-card sm-row"><span className="sm-iconbox sm-iconbox--sm"><Icon name="bell" /></span><div><strong>Dispatch alerted</strong><small>Ticket #DIS-8821 dispatched to fleet control</small></div></div>
          <div className="sm-card sm-row"><span className="sm-iconbox sm-iconbox--sm"><Icon name="list" /></span><div><strong>Driver countersign pending</strong><small>Awaiting digital sign-off from driver</small></div></div>
        </>) : (<>
          <div className="sm-card sm-row"><span className="sm-iconbox sm-iconbox--sm"><Icon name="checkc" /></span><div><strong>Stock count synced</strong><small>Inventory ledgers revised</small></div></div>
          <div className="sm-card sm-row"><span className="sm-iconbox sm-iconbox--sm"><Icon name="lock" /></span><div><strong>Dock bay unlocked for next shift</strong><small>Bay 2 ready for intake</small></div></div>
        </>)}
      </div>
    </div>
  );
}
