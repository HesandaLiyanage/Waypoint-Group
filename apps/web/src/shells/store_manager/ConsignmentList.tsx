import { Badge, SegmentedControl } from '../../components/common';
import { Icon } from './icons';
import type { Consignment } from './storeData';

export type Filter = 'all' | 'in_transit' | 'deferred' | 'delivered';
const label = { in_transit: 'Out for delivery', deferred: 'Deferred', delivered: 'Delivered' } as const;
const tone = { in_transit: 'info', deferred: 'warning', delivered: 'success' } as const;

export function ConsignmentList({ items, filter, onFilter, selectedId, onSelect }: { items: Consignment[]; filter: Filter; onFilter: (f: Filter) => void; selectedId: string; onSelect: (c: Consignment) => void }) {
  const n = (s: Consignment['status']) => items.filter((c) => c.status === s).length;
  const shown = filter === 'all' ? items : items.filter((c) => c.status === filter);
  return (
    <div className="sm-list">
      <div className="sm-list-head"><p className="sm-eyebrow">Your consignments</p><span>Latest first</span></div>
      <SegmentedControl label="Filter consignments" value={filter} onChange={(v) => onFilter(v as Filter)} options={[
        { value: 'all', label: `All (${items.length})` }, { value: 'in_transit', label: `In transit (${n('in_transit')})` }, { value: 'deferred', label: `Deferred (${n('deferred')})` }, { value: 'delivered', label: `Delivered (${n('delivered')})` }]} />
      <ul>
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" className={`sm-cons ${selectedId === c.id ? 'is-on' : ''}`} onClick={() => onSelect(c)} aria-current={selectedId === c.id ? 'true' : undefined}>
              <span className="sm-cons-top"><Badge tone="success">Fresh</Badge><strong>{c.id}</strong><span className="sm-spacer" /><Badge tone={tone[c.status]}>{label[c.status]}</Badge></span>
              <span className="sm-cons-line"><Icon name="clock" size={16} /> {c.window}{c.eta && <strong className="sm-eta">{c.eta}</strong>}</span>
              <span className="sm-cons-line sm-cons-sub">{c.crates} Crates • {c.summary}{c.vehicle && <span className="sm-spacer" />}{c.vehicle && <span><Icon name="snow" size={14} /> {c.vehicle.split(' ')[0]} (Refrig 4T)</span>}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
