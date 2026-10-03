import { useRef, useState } from 'react';
import { Badge, Button, Card } from '../../components/common';
import { ManifestSide } from './ManifestSide';
import { Icon } from './icons';
import { go } from './navigation';
import type { IssueType } from './receiptTypes';
import type { Consignment } from './storeData';

const types: { id: IssueType; label: string; icon: string }[] = [
  { id: 'damaged', label: 'Damaged', icon: 'archive' }, { id: 'short', label: 'Short quantity', icon: 'box' }, { id: 'wrong', label: 'Wrong item', icon: 'route' },
];

export function ReportScreen({ c, onSubmit }: { c: Consignment; onSubmit: (t: IssueType) => void }) {
  const [type, setType] = useState<IssueType | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="sm-page">
      <div className="sm-split sm-split--form">
        <Card className="sm-form">
          <div className="sm-form-head"><div><h1 className="sm-h1-md">Report an issue</h1><p className="sm-muted">Select the discrepancy flag for this inbound manifest to dispatch dockside resolution.</p></div><Badge tone="success">BAY 2</Badge></div>
          <p className="sm-label">Exception type</p>
          <div className="sm-types" role="radiogroup" aria-label="Exception type">
            {types.map((t) => <button key={t.id} type="button" role="radio" aria-checked={type === t.id} className={type === t.id ? 'is-on' : ''} onClick={() => setType(t.id)}><Icon name={t.icon} size={20} /> {t.label}</button>)}
          </div>
          <div className="sm-photo">
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)} />
            <Button variant="secondary" onClick={() => file.current?.click()}><Icon name="plus" /> Add photo (optional)</Button>
            {photo && <span className="sm-file"><Icon name="check" size={16} /> {photo} <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)}>×</button></span>}
          </div>
          <Button className="sm-btn-bad sm-submit" disabled={!type} onClick={() => type && onSubmit(type)}><Icon name="alert" /> Submit report</Button>
          <button type="button" className="sm-link sm-center" onClick={() => go('receipt')}>← Cancel and return to code entry</button>
        </Card>
        <ManifestSide c={c} />
      </div>
    </div>
  );
}
