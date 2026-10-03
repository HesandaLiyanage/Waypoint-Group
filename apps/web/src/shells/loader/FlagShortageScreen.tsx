import { useState } from 'react';
import { Badge } from '../../components/common';
import type { FlagKind, LoadItem, Trip } from './mockData';
import { Icon } from './icons';

interface Props {
  trip: Trip;
  stopSeq: number;
  stopOutlet: string;
  stopName: string;
  item: LoadItem;
  onBack: () => void;
  onSend: (kind: FlagKind, found: number) => void;
}

const kinds: { id: FlagKind; label: string; icon: string }[] = [
  { id: 'missing', label: 'Missing', icon: 'xcircle' },
  { id: 'damaged', label: 'Damaged', icon: 'box' },
  { id: 'short', label: 'Short quantity', icon: 'lines' },
];

export function FlagShortageScreen({ trip, stopSeq, stopOutlet, stopName, item, onBack, onSend }: Props) {
  const [kind, setKind] = useState<FlagKind>(item.flag?.kind ?? 'short');
  const [found, setFound] = useState<number>(item.flag?.found ?? Math.max(item.expected - 1, 0));
  const [photo, setPhoto] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const shown = kind === 'missing' ? 0 : found;
  const short = item.expected - shown;
  const label = kind === 'damaged' ? `${item.unit} damaged` : `${item.unit} found`;
  const value = kind === 'damaged' ? item.expected - shown : shown; // for damaged we store good count, show damaged count
  const step = (d: number) => {
    // For damaged, the stepper counts damaged units, so it moves opposite to "found".
    const delta = kind === 'damaged' ? -d : d;
    setFound((f) => Math.min(item.expected, Math.max(0, f + delta)));
  };
  const send = () => {
    setBusy(true);
    window.setTimeout(() => onSend(kind, kind === 'missing' ? 0 : found), 450);
  };
  return (
    <>
      <div className="ld-body">
        <button type="button" className="ld-back" onClick={onBack}><Icon name="back" size={20} /> Back to stops</button>
        <h1 className="ld-title">Flag a shortage</h1>

        <div className="ld-card ld-flag-item">
          <div>
            <p className="ld-eyebrow">{trip.id} · Stop {stopSeq} · {stopOutlet} {stopName}</p>
            <strong>{item.name}</strong>
            <small>Expected {item.expected} {item.unit}</small>
          </div>
          <Badge tone={item.temp === 'chilled' ? 'info' : 'neutral'}>{item.temp === 'chilled' ? 'Chilled' : 'Ambient'}</Badge>
        </div>

        <p className="ld-label">What is wrong?</p>
        <div role="radiogroup" aria-label="What is wrong" className="ld-radios">
          {kinds.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`ld-radio ${kind === k.id ? 'is-on' : ''}`} onClick={() => setKind(k.id)}>
              <Icon name={k.icon} size={22} /> <span>{k.label}</span>
              {kind === k.id && <span className="ld-radio-tick"><Icon name="check" size={22} /></span>}
            </button>
          ))}
        </div>

        <div className="ld-card ld-stepper-card">
          <div className="ld-stepper-head">
            <span className="ld-label">{label}</span>
            {short > 0 && <Badge tone="danger">{kind === 'damaged' ? `${item.expected - shown} damaged` : `${short} short`}</Badge>}
          </div>
          <div className="ld-stepper">
            <button type="button" className="ld-step" aria-label="Decrease" disabled={kind === 'missing'} onClick={() => step(-1)}><Icon name="minus" /></button>
            <div className="ld-step-value"><strong>{kind === 'missing' ? 0 : value}</strong><small>of {item.expected} expected</small></div>
            <button type="button" className="ld-step ld-step--plus" aria-label="Increase" disabled={kind === 'missing'} onClick={() => step(1)}><Icon name="plus" /></button>
          </div>
        </div>

        <label className="ld-photo">
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? '')} />
          <Icon name="camera" size={20} /> {photo || 'Add photo (optional)'}
        </label>
        <p className="ld-tip ld-tip--plain"><Icon name="info" size={20} /> Goes straight to the dispatcher at Peliyagoda, who decides whether to reload, substitute or defer.</p>
      </div>
      <div className="ld-actions">
        <button type="button" className="ld-btn ld-btn--primary" onClick={send} disabled={busy}><Icon name="send" size={20} /> {busy ? 'Sending…' : 'Send to dispatcher'}</button>
      </div>
    </>
  );
}
