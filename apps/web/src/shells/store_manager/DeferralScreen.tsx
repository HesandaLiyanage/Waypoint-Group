import { useState } from 'react';
import { AlertBanner, Badge, Button } from '../../components/common';
import { ConsignmentList, type Filter } from './ConsignmentList';
import { CallDispatcher, DISPATCH_PHONE } from './Detail';
import { Icon } from './icons';
import { go } from './navigation';
import type { Consignment } from './storeData';

export function DeferralScreen({ items, escalated, onEscalate, onSelect }: { items: Consignment[]; escalated: boolean; onEscalate: () => void; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('deferred');
  const c = items.find((x) => x.status === 'deferred') ?? items[1];
  return (
    <div className="sm-page">
      <div className="sm-heading sm-heading--tight"><div><p className="sm-eyebrow">Waypoint Fresh consignment log • <span className="sm-warn-text">Exception & allocation review</span></p><h1 className="sm-h1-md">Consignment Deferral Notice</h1></div><Button variant="secondary" onClick={() => window.print()}><Icon name="print" /> Print manifest</Button></div>
      <AlertBanner tone="warning" title={`Consignment ${c.id} deferred to next morning dispatch — rescheduled for tomorrow 05:30 AM`} action={<span className="sm-pill sm-pill--warn">Status: deferred</span>}>Fleet reallocation active · Deepavali high influx (priority cycle)</AlertBanner>
      <div className="sm-split sm-split--wide">
        <div className="sm-stack">
          <ConsignmentList items={items} filter={filter} onFilter={setFilter} selectedId={c.id} onSelect={(x) => { onSelect(x.id); if (x.status !== 'deferred') go('inbound'); }} />
          <section className="sm-card sm-depot">
            <h3><Icon name="truck" /> Depot allocation status</h3>
            <p className="sm-muted">Cross-dock distribution metrics for the Western Province reefer fleet.</p>
            <div className="sm-meter warn"><div><span>Reefer truck fleet capacity</span><strong>96% (critical peak)</strong></div><div className="sm-alloc-bar"><span style={{ width: '96%' }} /></div></div>
            <div className="sm-meter"><div><span>Cold dock chamber staging load</span><strong>64% (stable nominal)</strong></div><div className="sm-alloc-bar"><span style={{ width: '64%' }} /></div></div>
            <p className="sm-muted"><strong>Transport corridor alert:</strong> Colombo–Kadugannawa corridor has festive congestion. Cold triage routing active for all perishables.</p>
          </section>
        </div>
        <div className="sm-detail">
          <div className="sm-detail-head"><div><h2>Order Deferral — {c.id} <Badge tone="warning">Deferred</Badge></h2><p className="sm-muted">Peliyagoda Central Cold Hub • Reallocated from run #COL-047-92144</p></div></div>
          <div className="sm-reason">
            <p className="sm-eyebrow sm-warn-text">Official dispatcher logged reason <Badge tone="warning">Hub incident #DEF-7881</Badge></p>
            <p>“Fleet reefer capacity short due to seasonal Deepavali fresh surge across Colombo & Gampaha districts. Two 4T refrigerated vehicles (VEH018, VEH021) underwent unscheduled workshop maintenance at Peliyagoda depot. Cold-chain integrity guaranteed: crates staged in Hub Cold Bay #02. Priority transit assigned to first morning route.”</p>
            <small>Logged by: K. Jayasuriya (senior dispatch controller, Peliyagoda Central Hub) · 04:15 PM (today)</small>
          </div>
          <p className="sm-section-title"><Icon name="calendar" /> Delivery schedule comparison & reassignment</p>
          <div className="sm-compare">
            <div><small>Original schedule <Badge tone="neutral">Missed / reallocated</Badge></small><strong>Expected today</strong><span>06:00 AM – 07:30 AM</span><em>Order cutoff: yesterday 4:00 PM</em></div>
            <div className="is-new"><small>Confirmed slot <Badge tone="success">Priority wave #1</Badge></small><strong>Tomorrow morning</strong><span>05:30 AM – 07:00 AM</span><em>Reassigned: run #COL-047-92400 lock confirmed</em></div>
          </div>
          <div className="sm-info-grid sm-info-grid--two"><div><small>Reassigned carrier & driver</small><strong>VEH022 (Refrig 6T) · M. Perera</strong></div><div><small>Depot security staging seal</small><strong>#LK-PEL-89021 (chamber cold lock)</strong></div></div>
          <p className="sm-section-title">Deferred items ({c.skus.length} SKUs • {c.crates} crates)</p>
          <div className="sm-table-wrap"><table className="sm-table"><thead><tr><th>SKU & description</th><th>Volume</th><th>Temp target</th><th>Bay status</th></tr></thead><tbody>
            {c.skus.map((s) => <tr key={s.sku}><td><strong>{s.name}</strong><small>{s.sku}</small></td><td><strong>{s.crates} crates</strong><small>({s.qty})</small></td><td><Badge tone="info">{s.telemetry}</Badge></td><td><Badge tone="success">✓ Staged</Badge></td></tr>)}
          </tbody></table></div>
          <CallDispatcher />
          <div className="sm-actions sm-actions--between">
            {escalated ? <span className="sm-ok-text" role="status"><Icon name="check" /> Priority escalation requested. The Peliyagoda desk was notified.</span> : <Button variant="secondary" onClick={onEscalate}><Icon name="bolt" /> Request priority escalation via Peliyagoda desk</Button>}
            <Button variant="ghost" onClick={() => window.print()}><Icon name="print" /> Print deferral manifest</Button>
          </div>
          <p className="sm-fine">Peliyagoda dispatch desk 24/7 hotline: <strong>{DISPATCH_PHONE}</strong> • Direct cold line ext. 407</p>
        </div>
      </div>
    </div>
  );
}
