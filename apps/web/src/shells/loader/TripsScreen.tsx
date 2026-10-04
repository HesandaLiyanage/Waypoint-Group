import { Badge, AlertBanner } from '../../components/common';
import type { Trip } from './mockData';
import { counts, tripStatus } from './helpers';
import { Icon } from './icons';

interface Props {
  trips: Trip[];
  sealed: Record<string, boolean>;
  planState: 'updated' | 'reloaded';
  lastSynced: string;
  activeTrip: Trip;
  onOpen: (tripId: string) => void;
}

const statusLabel = { ready: 'Ready', loading: 'Loading', not_started: 'Not started' } as const;
const statusTone = { ready: 'success', loading: 'info', not_started: 'neutral' } as const;
const brandTone = { Fresh: 'success', Style: 'danger', Tech: 'info' } as const;

export function TripsScreen({ trips, sealed, planState, lastSynced, activeTrip, onOpen }: Props) {
  const status = (t: Trip) => tripStatus(t, !!sealed[t.id]);
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Colombo' }).format(new Date());
  return (
    <>
      <div className="ld-body">
        <p className="ld-eyebrow"><span className="ld-dot" /> Peliyagoda dock · Shift 01</p>
        <h1 className="ld-title">Today's trips</h1>
        <p className="ld-sub">{today} · Last synced {lastSynced}</p>

        <div className="ld-tiles">
          <div className="ld-tile"><strong>{trips.length}</strong><span>Trips</span></div>
          <div className="ld-tile ld-tile--info"><strong>{trips.filter((t) => status(t) === 'loading').length}</strong><span>Loading</span></div>
          <div className="ld-tile ld-tile--ok"><strong>{trips.filter((t) => status(t) === 'ready').length}</strong><span>Ready</span></div>
        </div>

        <div className="ld-list">
          {trips.map((t) => {
            const c = counts(t);
            const st = status(t);
            const pct = c.total ? Math.round((c.loaded / c.total) * 100) : 0;
            return (
              <button key={t.id} type="button" className={`ld-trip ${t.id === activeTrip.id ? 'is-active' : ''}`} onClick={() => onOpen(t.id)} aria-label={`Open trip ${t.id}`}>
                <span className="ld-trip-top">
                  <span className="ld-trip-id">{t.id}</span>
                  <Badge tone={brandTone[t.brand]}>{t.brand}</Badge>
                  <span className="ld-spacer" />
                  <Badge tone={statusTone[st]}>{statusLabel[st]}</Badge>
                </span>
                <span className="ld-trip-line"><span>{t.district} · {t.stops.length} stops</span><strong>Departs {t.depart}</strong></span>
                <span className="ld-trip-meta">{t.vehicle} · {t.extra}</span>
                <span className="ld-progress-label"><span>{c.loaded} of {c.total} items loaded</span><span>{pct}%</span></span>
                <span className="ld-bar"><span style={{ width: `${pct}%` }} /></span>
                <span className="ld-chips">
                  {t.tags.map((g) => <Badge key={g.label} tone={g.tone}>{g.label}</Badge>)}
                  {c.flagged > 0 && <Badge tone="danger">{c.flagged} flag open</Badge>}
                </span>
                {t.planUpdated && planState === 'updated' && (
                  <span className="ld-inline-alert"><Icon name="warn" size={20} /> Plan updated {t.planUpdated} · reload list before loading</span>
                )}
              </button>
            );
          })}
        </div>

        <AlertBanner tone="info" title="Tip. Tap a trip to open its loading order.">
          Trips marked Plan updated must be reloaded before you continue.
        </AlertBanner>
      </div>
      <div className="ld-actions">
        <button type="button" className="ld-btn ld-btn--primary" onClick={() => onOpen(activeTrip.id)}>
          <Icon name="send" size={20} /> Continue loading {activeTrip.id}
        </button>
      </div>
    </>
  );
}
