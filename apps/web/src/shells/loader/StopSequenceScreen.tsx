import { Badge } from '../../components/common';
import type { Trip } from './mockData';
import { counts, stopCounts } from './helpers';
import { Icon } from './icons';

export interface SyncState { queued: number; syncing: number; synced: number }
interface Props {
  trip: Trip;
  sync: SyncState;
  expandedSeq: number;
  onExpand: (seq: number) => void;
  onBack: () => void;
  onToggle: (itemId: string) => void;
  onFlag: (itemId: string) => void;
  onFlagButton: () => void;
  onReview: () => void;
}

export function SyncStrip({ sync }: { sync: SyncState }) {
  return (
    <div className="ld-sync-strip" role="status" aria-label="Sync status">
      <span>Sync:</span>
      <Badge tone="success">Synced {sync.synced}</Badge>
      <Badge tone="warning">Syncing {sync.syncing}</Badge>
      <Badge tone="neutral">Queued {sync.queued}</Badge>
    </div>
  );
}

export function StopSequenceScreen({ trip, sync, expandedSeq, onExpand, onBack, onToggle, onFlag, onFlagButton, onReview }: Props) {
  const c = counts(trip);
  const pct = c.total ? Math.round((c.loaded / c.total) * 100) : 0;
  const stops = [...trip.stops].sort((a, b) => b.seq - a.seq); // last stop is loaded first
  return (
    <>
      <div className="ld-body">
        <button type="button" className="ld-back" onClick={onBack}><Icon name="back" size={20} /> All trips</button>
        <p className="ld-eyebrow">Trip · {trip.label} · {trip.district} · {trip.stops.length} stops</p>
        <h1 className="ld-title">Load in this order</h1>
        <p className="ld-sub">Stop {trip.stops.length} goes on first, so it comes off last.</p>

        <SyncStrip sync={sync} />
        <div className="ld-progress-label"><span>{c.loaded} of {c.total} items loaded</span><span>{pct}%</span></div>
        <div className="ld-bar ld-bar--lg"><span style={{ width: `${pct}%` }} /></div>

        <div className="ld-list">
          {stops.map((s) => {
            const sc = stopCounts(s);
            const open = expandedSeq === s.seq;
            const complete = sc.done === sc.total && !sc.hasFlag;
            return (
              <div key={s.seq} className={`ld-stop ${open ? 'is-open' : ''}`}>
                <button type="button" className="ld-stop-head" aria-expanded={open} onClick={() => onExpand(s.seq)}>
                  <span className={`ld-stop-num ${complete ? 'is-done' : open ? 'is-now' : ''}`}>{complete && !open ? <Icon name="check" size={20} /> : s.seq}</span>
                  <span className="ld-stop-text">
                    <small>Stop {s.seq} · {s.outlet}</small>
                    <strong>{s.name}</strong>
                    {open && <em>{s.window ? `Dock window ${s.window} · ` : ''}{s.dock}</em>}
                    {!open && !complete && <em>{s.items.length} items</em>}
                  </span>
                  <span className={`ld-stop-count ${sc.hasFlag ? 'is-flag' : complete ? 'is-done' : ''}`}>{sc.loaded} / {sc.total} loaded</span>
                </button>
                {open && (
                  <ul className="ld-items">
                    {s.items.map((it) => (
                      <li key={it.id} className={`ld-item ${it.state === 'flagged' ? 'is-flagged' : ''}`}>
                        {it.state === 'flagged' ? (
                          <button type="button" className="ld-check is-flag" onClick={() => onFlag(it.id)} aria-label={`Edit flag for ${it.name}`}><Icon name="warn" size={24} /></button>
                        ) : (
                          <button type="button" role="checkbox" aria-checked={it.state === 'loaded'} aria-label={`Mark ${it.name} loaded`} className={`ld-check ${it.state === 'loaded' ? 'is-on' : ''}`} onClick={() => onToggle(it.id)}>
                            {it.state === 'loaded' && <Icon name="check" size={22} />}
                          </button>
                        )}
                        <span className="ld-item-text">
                          <strong>{it.name}</strong>
                          <small>{it.detail}</small>
                          <span className="ld-chips">
                            <Badge tone={it.temp === 'chilled' ? 'info' : 'neutral'}>{it.temp === 'chilled' ? 'Chilled' : 'Ambient'}</Badge>
                            {it.state === 'loaded' && <Badge tone="success">Loaded</Badge>}
                            {it.state === 'flagged' && <Badge tone="danger">Flagged</Badge>}
                          </span>
                        </span>
                        {it.state !== 'flagged' && (
                          <button type="button" className="ld-iconbtn" aria-label={`Flag problem with ${it.name}`} onClick={() => onFlag(it.id)}><Icon name="flag" size={20} /></button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="ld-tip"><Icon name="info" size={20} /> Tip. Tap a box to mark an item loaded. Scans are saved on this device and sync when there is signal.</p>
      </div>
      <div className="ld-actions ld-actions--two">
        <button type="button" className="ld-btn ld-btn--danger-outline" onClick={onFlagButton}><Icon name="flag" size={20} /> Flag shortage</button>
        <button type="button" className="ld-btn ld-btn--primary" onClick={onReview}>Review trip</button>
      </div>
    </>
  );
}
