import { Badge } from '../../components/common';
import type { Trip } from './mockData';
import { allItems, counts, stopCounts } from './helpers';
import { Icon } from './icons';

interface Props {
  trip: Trip;
  planState: 'updated' | 'reloaded';
  sealed: boolean;
  queued: boolean;
  onReload: () => void;
  onMarkReady: () => void;
  onOpenStop: (seq: number) => void;
  onBackToTrips: () => void;
}

export function TripReadyScreen({ trip, planState, sealed, queued, onReload, onMarkReady, onOpenStop, onBackToTrips }: Props) {
  const c = counts(trip);
  const flagged = allItems(trip).filter((i) => i.state === 'flagged');
  const stops = [...trip.stops].sort((a, b) => b.seq - a.seq);
  const planOpen = !!trip.planUpdated && planState === 'updated';
  const blocked = c.pending > 0 || planOpen;
  return (
    <>
      <div className="ld-body">
        {trip.planUpdated && (
          <div className={`ld-banner ${planOpen ? 'is-warn' : 'is-ok'}`} role="status">
            <Icon name={planOpen ? 'warn' : 'check'} size={24} />
            <div>
              <strong>{planOpen ? `Plan updated ${trip.planUpdated}.` : 'List reloaded.'}</strong>
              <span>{planOpen ? 'Reload the list before you finish.' : `Plan from ${trip.planUpdated} is on this device.`}</span>
            </div>
            {planOpen && <button type="button" className="ld-banner-btn" onClick={onReload}>Reload list</button>}
          </div>
        )}
        <p className="ld-eyebrow">{trip.label} · {trip.district} · Departs {trip.depart}</p>
        <h1 className="ld-title">{sealed ? 'Trip sealed' : 'Ready to go?'}</h1>

        <div className="ld-tiles">
          <div className="ld-tile ld-tile--ok"><strong>{c.loaded}</strong><span>Loaded</span></div>
          <div className="ld-tile ld-tile--bad"><strong>{c.flagged}</strong><span>Flagged</span></div>
          <div className="ld-tile"><strong>{c.pending}</strong><span>Left to load</span></div>
        </div>

        {flagged.map((it) => {
          const stop = trip.stops.find((s) => s.items.some((x) => x.id === it.id))!;
          const f = it.flag!;
          const diff = it.expected - f.found;
          return (
            <div key={it.id} className="ld-card ld-flagged-card">
              <div className="ld-flagged-top"><span className="ld-eyebrow">Flagged item</span><Badge tone={queued ? 'warning' : 'info'}>{queued ? 'Queued' : `Sent ${f.sentAt}`}</Badge></div>
              <strong>{it.name}</strong>
              <div className="ld-flagged-line"><small>Stop {stop.seq} · {stop.outlet} {stop.name}</small><span>{f.kind === 'missing' ? 'Missing' : f.kind === 'damaged' ? 'Damaged' : 'Short quantity'}: {diff} {it.unit}</span></div>
            </div>
          );
        })}

        <p className="ld-label">Stops</p>
        <div className="ld-grid">
          {stops.map((s) => {
            const sc = stopCounts(s);
            const done = sc.done === sc.total && !sc.hasFlag;
            return (
              <button key={s.seq} type="button" className={`ld-gridcell ${sc.hasFlag ? 'is-flag' : ''}`} onClick={() => onOpenStop(s.seq)}>
                <Icon name={sc.hasFlag ? 'warn' : done ? 'check' : 'minus'} size={20} />
                <strong>Stop {s.seq}</strong><span>{sc.loaded}/{sc.total}</span>
              </button>
            );
          })}
        </div>
        {blocked && !sealed && (
          <p className="ld-tip ld-tip--plain"><Icon name="info" size={20} /> {planOpen ? 'Reload the updated plan to continue.' : `${c.pending} items still need loading or flagging.`}</p>
        )}
      </div>
      <div className="ld-actions">
        {sealed ? (
          <button type="button" className="ld-btn ld-btn--primary" onClick={onBackToTrips}>Back to trips</button>
        ) : (
          <button type="button" className="ld-btn ld-btn--primary" disabled={blocked} onClick={onMarkReady}><Icon name="check" size={20} /> Mark trip ready</button>
        )}
      </div>
    </>
  );
}
