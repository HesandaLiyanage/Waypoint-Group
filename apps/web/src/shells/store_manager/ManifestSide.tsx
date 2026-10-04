import { Badge } from '../../components/common';
import { Icon } from './icons';
import type { Consignment } from './storeData';

export function ManifestSide({ c, extra }: { c: Consignment; extra?: 'driver' | 'next' }) {
  return (
    <aside className="sm-side">
      <section className="sm-card"><div className="sm-list-head"><p className="sm-eyebrow">Manifest summary</p><span className="sm-chip-id">{c.id}</span></div>
        <div className="sm-sum"><div><small>Assigned vehicle</small><strong>{c.vehicle ?? 'Not assigned'}</strong></div><div><small>Volume</small><strong>{c.crates} crates</strong></div></div></section>
      {extra === 'driver' ? (<></>) : (
        <section className="sm-card"><p className="sm-eyebrow"><Icon name="info" size={16} /> What happens next</p>
          <ol className="sm-next"><li><span>1</span>Report sent to dispatch</li><li><span>2</span>Driver countersigns</li><li><span>3</span>Stock count updated</li></ol></section>
      )}
    </aside>
  );
}
