import { useState } from 'react';
import { AlertBanner } from '../../components/common';
import { ConsignmentList, type Filter } from './ConsignmentList';
import { InboundDetail } from './Detail';
import { go } from './navigation';
import { useAuth } from '../../context/AuthContext';
import type { LiveConsignment } from './live';

export function InboundScreen({ items, selectedId, onSelect, onConfirmReceipt }: { items: LiveConsignment[]; selectedId: string; onSelect: (id: string) => void; onConfirmReceipt: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const selected = items.find((c) => c.id === selectedId) ?? items[0];
  const { currentUser } = useAuth();
  const next = items.find((c) => c.stopStatus === 'pending' && c.eta) ?? items.find((c) => c.stopStatus === 'arrived');
  const active = items.filter((c) => c.status === 'in_transit').length;
  return (
    <div className="sm-page">
      <div className="sm-heading sm-heading--tight"><div><p className="sm-eyebrow sm-eyebrow--accent">Waypoint Fresh consignment log • Store receiving manifest</p><h1 className="sm-h1-md">Consignments & Order Inbound</h1></div><div className="sm-location sm-location--ok">Active location: {currentUser?.outlet_id} — Waypoint Fresh</div></div>
      <AlertBanner tone="success" title={next ? `${next.id}${next.vehicle ? ` · ${next.vehicle}` : ''} · ${next.stopStatus === 'arrived' ? 'driver has arrived' : next.eta}` : active ? 'Orders are waiting for the dispatcher\'s plan' : 'No delivery on the way right now'} action={<span className="sm-pill">{items.filter((c) => c.status !== 'delivered').length} consignments active</span>} />
      <div className="sm-split sm-split--wide">
        <ConsignmentList items={items} filter={filter} onFilter={setFilter} selectedId={selected.id} onSelect={(c) => onSelect(c.id)} />
        <InboundDetail c={selected} onTrack={() => go('track')} onConfirmReceipt={onConfirmReceipt} onDeferral={() => go('deferral')} />
      </div>
    </div>
  );
}
