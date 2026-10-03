import { useState } from 'react';
import { AlertBanner } from '../../components/common';
import { ConsignmentList, type Filter } from './ConsignmentList';
import { InboundDetail } from './Detail';
import { go } from './navigation';
import type { Consignment } from './storeData';

export function InboundScreen({ items, selectedId, onSelect, onConfirmReceipt }: { items: Consignment[]; selectedId: string; onSelect: (id: string) => void; onConfirmReceipt: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const selected = items.find((c) => c.id === selectedId) ?? items[0];
  const active = items.filter((c) => c.status === 'in_transit').length;
  return (
    <div className="sm-page">
      <div className="sm-heading sm-heading--tight"><div><p className="sm-eyebrow sm-eyebrow--accent">Waypoint Fresh consignment log • Store receiving manifest</p><h1 className="sm-h1-md">Consignments & Order Inbound</h1></div><div className="sm-location sm-location--ok">Active location: OUT047 — Waypoint Fresh</div></div>
      <AlertBanner tone="success" title={active ? 'Next delivery arriving in ~18 min — VEH014 en route from Peliyagoda' : 'No delivery on the way right now'} action={<span className="sm-pill">{items.filter((c) => c.status !== 'delivered').length} consignments active</span>} />
      <div className="sm-split sm-split--wide">
        <ConsignmentList items={items} filter={filter} onFilter={setFilter} selectedId={selected.id} onSelect={(c) => onSelect(c.id)} />
        <InboundDetail c={selected} onTrack={() => go('track')} onConfirmReceipt={onConfirmReceipt} onDeferral={() => go('deferral')} />
      </div>
    </div>
  );
}
