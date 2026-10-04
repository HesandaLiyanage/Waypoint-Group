import { AlertBanner, Badge, Button, Card } from '../../components/common';
import { ManifestSide } from './ManifestSide';
import { Icon } from './icons';
import { go } from './navigation';
import type { LiveConsignment } from './live';

// The store manager shows the code on arrival; the driver types it. Afterwards the manager confirms or disputes what arrived.
export function ReceiptScreen({ c, busy, error, onIssueCode, onConfirm }: { c: LiveConsignment; busy: boolean; error: string; onIssueCode: () => void; onConfirm: () => void }) {
  const s = c.stopStatus;
  const delivered = s === 'delivered' || s === 'delivered_short';
  return (
    <div className="sm-page">
      <div className="sm-split sm-split--form">
        <Card className="sm-form">
          <div className="sm-form-head"><h1 className="sm-h1-md">Receipt confirmation</h1><Badge tone={delivered ? 'success' : 'info'}>{c.id}</Badge></div>
          {error && <AlertBanner tone="danger" title="Not completed">{error}</AlertBanner>}
          {!c.stopId && <p className="sm-muted">This order is not on a published trip yet, so there is nothing to receive.</p>}
          {c.stopId && s === 'pending' && <p className="sm-muted">The driver has not arrived. When they do, you can show them a code here.</p>}
          {s === 'arrived' && <>
            {c.code ? <>
              <p className="sm-muted">The driver is at your outlet. Read this code to them; they enter it with the counts they unloaded.</p>
              <div className="sm-otp"><div className="sm-otp-boxes" role="group" aria-label="Your four-digit receipt code">{c.code.value.split('').map((d, i) => <input key={i} value={d} readOnly aria-label={`Digit ${i + 1}`} />)}</div>
                <small className="sm-hint">Valid for 30 minutes{c.code.expiresAt ? ` · until ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }).format(new Date(c.code.expiresAt))}` : ''}. Five wrong tries lock it.</small></div>
              <Button variant="secondary" disabled={busy} onClick={onIssueCode}>Issue a new code</Button>
            </> : <Button disabled={busy} onClick={onIssueCode}><Icon name="shield" /> Show receipt code to driver</Button>}
          </>}
          {delivered && <>
            <p className="sm-muted">The driver recorded this delivery{s === 'delivered_short' ? ' with a shortfall' : ' in full'}. Confirm it matches what you received, or report a problem.</p>
            {c.received && <ul>{c.skus.map((k, i) => <li key={k.sku + i}>{k.name}: {c.received?.[i]?.qty ?? '?'} of {k.crates} received</li>)}</ul>}
            <div className="sm-two-btn">
              <Button className="sm-btn-ok" disabled={busy} onClick={onConfirm}><Icon name="checkc" /> This matches what arrived</Button>
              <Button className="sm-btn-bad" disabled={busy} onClick={() => go('report')}><Icon name="alert" /> Report an issue</Button>
            </div>
          </>}
          {(s === 'receipt_confirmed' || s === 'receipt_disputed') && <AlertBanner tone={s === 'receipt_confirmed' ? 'success' : 'warning'} title={s === 'receipt_confirmed' ? 'Receipt confirmed' : 'Issue reported to dispatch'}>{s === 'receipt_confirmed' ? 'Thank you. The delivery is closed.' : 'Dispatch will follow up with you.'}</AlertBanner>}
          {s === 'failed' && <AlertBanner tone="warning" title="Delivery not completed">The driver recorded this stop as not delivered. Dispatch will arrange the next run.</AlertBanner>}
        </Card>
        <ManifestSide c={c} extra="driver" />
      </div>
    </div>
  );
}
