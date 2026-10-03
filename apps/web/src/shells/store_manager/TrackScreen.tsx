import { AlertBanner, Badge, Button } from '../../components/common';
import { CallDispatcher, SkuTable } from './Detail';
import { Icon } from './icons';
import { go } from './navigation';
import type { Consignment } from './storeData';

export function TrackScreen({ c, onConfirmReceipt }: { c: Consignment; onConfirmReceipt: () => void }) {
  return (
    <div className="sm-page">
      <div className="sm-heading sm-heading--tight"><div><p className="sm-eyebrow sm-eyebrow--accent">Waypoint Fresh consignment log • Live telemetry & route tracking</p><h1 className="sm-h1-md">Track Delivery — Inbound Consignment {c.id}</h1><p className="sm-muted">Peliyagoda Hub to OUT047 corridor • Vehicle run COL-047-92308</p></div><div className="sm-actions"><div className="sm-location sm-location--ok">Active destination OUT047 — Waypoint Fresh</div><Button variant="secondary" onClick={() => window.print()}><Icon name="print" /> Print route manifest</Button></div></div>
      <AlertBanner tone="success" title="Vehicle VEH014 en route to OUT047 — arriving in ~18 min" action={<span className="sm-pill">T-minus 18 min · dock touchdown 06:48 AM</span>}>Inbound dispatch window · priority transit active</AlertBanner>
      <div className="sm-split sm-split--wide">
        <div className="sm-stack">
          <section className="sm-card"><p className="sm-eyebrow">Consignments for OUT047</p>
            <button type="button" className="sm-cons is-on" onClick={() => go('inbound')}><span className="sm-cons-top"><strong>{c.id}</strong><span className="sm-spacer" /><Badge tone="info">In transit</Badge></span><span className="sm-cons-line">{c.crates} crates • Seasonal organics & greens</span><span className="sm-cons-line">ETA 06:48 AM</span></button>
          </section>
          <section className="sm-card"><h3><Icon name="truck" /> Fleet telemetry & receiving dock <Badge tone="success">Sensors nominal</Badge></h3>
            <div className="sm-info-grid sm-info-grid--two"><div><small>Assigned carrier</small><strong>VEH014 (Refrigerated 4T)</strong><span className="sm-muted">Driver: K. Fernando</span><a href="tel:+94774128820">+94 77 412 8820</a></div><div><small>Bay 04 status (OUT047)</small><strong>+3.8°C chilled target</strong><span className="sm-muted">Relative humidity 86%</span><em>Dock gate bay B-04 active</em></div></div>
            <p className="sm-muted"><strong>Colombo–Kandy corridor:</strong> flowing smoothly, clear approach to OUT047. No route diversions.</p>
          </section>
        </div>
        <div className="sm-detail">
          <div className="sm-detail-head"><div><h2>Consignment {c.id} <Badge tone="info"><Icon name="truck" size={14} /> Out for delivery</Badge></h2><p className="sm-muted">Peliyagoda Central Hub • Run #COL-047-92308</p></div></div>
          <div className="sm-info-grid"><div><small>Expected arrival window</small><strong>06:40 AM – 07:10 AM</strong><em>Estimated touchdown 06:48 AM</em></div><div><small>Speed & heading</small><strong>38 km/h</strong><span className="sm-muted">South-west via A1</span></div><div><small>Chamber temperature</small><strong>+3.1°C ❄</strong><em>−2.0°C to +4.0°C verified</em></div></div>
          <p className="sm-section-title">Route progression & stop sequence <span className="sm-muted">1 stop remaining</span></p>
          <ol className="sm-steps sm-steps--v">
            <li className="done"><span><Icon name="check" size={16} /></span><div><strong>Peliyagoda Central Hub</strong><small>Origin logistics terminal • loaded & sealed</small></div><em>Departed 05:40 AM</em></li>
            <li className="done"><span><Icon name="check" size={16} /></span><div><strong>St. Anthony's Super (stop 1 of 3)</strong><small>8 crates dropped • manifest verified</small></div><em>Cleared 06:22 AM</em></li>
            <li className="done"><span><Icon name="check" size={16} /></span><div><strong>Cargills Express Kiribathgoda (stop 2 of 3)</strong><small>6 crates dropped • cold chain verified</small></div><em>Cleared 06:36 AM</em></li>
            <li className="next"><span><Icon name="route" size={16} /></span><div><strong>OUT047 — Waypoint Fresh (stop 3 of 3) <Badge tone="info">Target</Badge></strong><small>Final inbound destination • receiving dock bay B-04</small></div><em>Next stop ETA ~18 mins</em></li>
          </ol>
          <div className="sm-info-grid sm-info-grid--two"><div><small>Carrier & dispatch metrics</small><strong>Cutoff compliance: yesterday 3:42 PM (on time)</strong><span className="sm-muted">Hub dispatcher: K. Jayasuriya · Container seal #LK-PEL-88412 (intact)</span></div><div><small>Consignment load summary</small><strong>18 crates / 240 kg</strong><span className="sm-muted">4 fresh produce categories · chiller telemetry continuous</span></div></div>
          <p className="sm-section-title">Loaded consignment inventory <Badge tone="success">Ready for inspection</Badge></p>
          <SkuTable skus={c.skus} status="transit" />
          <div className="sm-actions"><Button onClick={onConfirmReceipt}><Icon name="checkc" /> Confirm receipt</Button><a className="sm-call sm-call--sm" href="tel:+94774128820"><Icon name="phone" size={20} /> Direct driver contact</a></div>
          <CallDispatcher />
        </div>
      </div>
    </div>
  );
}
