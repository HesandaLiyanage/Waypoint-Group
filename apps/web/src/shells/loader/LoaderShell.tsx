import { useMemo, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useSync } from '../../context/SyncContext';
import { AlertBanner, EmptyState, roleNavigation } from '../../components/common';
import type { FlagKind } from './mockData';
import { useLoaderTrips, type LiveTrip } from './live';
import { allItems, counts } from './helpers';
import { Icon } from './icons';
import { TripsScreen } from './TripsScreen';
import { StopSequenceScreen, type SyncState } from './StopSequenceScreen';
import { FlagShortageScreen } from './FlagShortageScreen';
import { TripReadyScreen } from './TripReadyScreen';
import './loader.css';

type Screen = 'trips' | 'loading' | 'flag' | 'ready';
const clock = (d: Date) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Colombo' }).format(d);

export function LoaderShell() {
  const { trips, ready } = useLoaderTrips();
  const { workspaceError } = useSync();
  if (!trips.length) return <div className="ld-root"><div className="ld-phone" style={{ padding: 16 }}>{workspaceError ? <AlertBanner tone="danger" title="Could not load trips">{workspaceError}</AlertBanner> : <EmptyState title={ready ? 'No trips to load yet' : 'Loading trips'} description={ready ? 'Trips appear here once the dispatcher publishes the plan.' : 'Fetching today\'s loading list.'} />}</div></div>;
  return <LoaderRun trips={trips} />;
}

function LoaderRun({ trips }: { trips: LiveTrip[] }) {
  const { locale } = useI18n();
  const { isOnline, isSyncing, pendingCount, rejected, lastSyncedAt, send, discard } = useSync();
  const [activeId, setActiveId] = useState(trips[0].id);
  const [screen, setScreen] = useState<Screen>('trips');
  const [expandedSeq, setExpandedSeq] = useState(-1);
  const [flagItemId, setFlagItemId] = useState<string | null>(null);
  const [justFlagged, setJustFlagged] = useState(false);

  const trip = trips.find((t) => t.id === activeId) ?? trips[0];
  const planState: 'updated' | 'reloaded' = trip.acknowledged ? 'reloaded' : 'updated';
  const sealed = Object.fromEntries(trips.map((t) => [t.id, ['sealed', 'departed', 'completed'].includes(t.tripStatus)]));
  const sync = { queued: isSyncing ? 0 : pendingCount, syncing: isSyncing ? pendingCount : 0, synced: 0 };
  const lastSynced = lastSyncedAt ? clock(new Date(lastSyncedAt)) : '–';
  const locked = sealed[trip.id];

  // Every action is written to the on-device outbox first, then sent; a refused action stays visible below.
  const loadCheck = (itemId: string, quantity: number, status?: string, note?: string) => {
    const [stopId, line] = itemId.split(':');
    return send({ action: 'load_check', trip_id: trip.id, stop_id: stopId, line_no: Number(line), quantity, status, note, plan_version: trip.planVersion });
  };
  const openTrip = (id: string) => { setActiveId(id); const first = trips.find((t) => t.id === id); if (first) setExpandedSeq(first.stops.find((s) => s.items.some((i) => i.state !== 'loaded'))?.seq ?? first.stops[0]?.seq ?? -1); setScreen('loading'); };
  const toggleItem = (itemId: string) => {
    if (locked) return;
    const item = trip.stops.flatMap((s) => s.items).find((i) => i.id === itemId);
    // A recorded check cannot be silently undone: loading is marked once, a problem is raised as a shortage.
    if (item && item.state !== 'loaded') void loadCheck(itemId, item.expected);
  };
  const startFlag = (itemId: string) => { setFlagItemId(itemId); setScreen('flag'); };
  const flagButton = () => {
    const items = allItems(trip);
    const open = trip.stops.find((s) => s.seq === expandedSeq)?.items[0];
    startFlag((items.find((i) => i.state === 'flagged') ?? open ?? items[0]).id);
  };
  const sendFlag = (kind: FlagKind, found: number) => {
    if (!flagItemId || locked) return;
    const item = allItems(trip).find((i) => i.id === flagItemId);
    if (!item) return;
    void loadCheck(flagItemId, found, kind === 'damaged' ? 'damaged' : 'short', `${kind}: ${found} of ${item.expected} ${item.unit} usable`);
    setJustFlagged(true);
    setScreen('loading');
  };
  const reload = () => { void send({ action: 'ack_plan', trip_id: trip.id, plan_version: trip.planVersion }); };
  const markReady = () => {
    void send({ action: 'ack_plan', trip_id: trip.id, plan_version: trip.planVersion });
    void send({ action: 'seal', trip_id: trip.id, plan_version: trip.planVersion });
  };

  const tabs = roleNavigation.loader;
  const activeTab = screen === 'trips' ? 'trips' : screen === 'flag' ? 'issues' : 'loading';
  const tabIcon = { trips: 'truck', loading: 'list', issues: 'flag' } as const;
  const goTab = (id: string) => { if (id === 'trips') setScreen('trips'); else if (id === 'loading') setScreen('loading'); else flagButton(); };

  const flagItem = useMemo(() => allItems(trip).find((i) => i.id === flagItemId) ?? allItems(trip)[0], [trip, flagItemId]);
  const flagStop = trip.stops.find((s) => s.items.some((i) => i.id === flagItem?.id)) ?? trip.stops[0];
  const activeForHome = trips.find((t) => counts(t).pending > 0 && counts(t).handled > 0) ?? trips.find((t) => t.id === activeId) ?? trips[0];

  return (
    <div className="ld-root">
      <div className="ld-phone">
        <div className="ld-status" aria-live="polite">
          <span className={`ld-pill ${sync.syncing ? 'is-syncing' : sync.queued ? 'is-queued' : 'is-synced'}`}>
            <Icon name="check" size={16} /> {sync.syncing ? `Syncing ${sync.syncing}` : sync.queued ? (isOnline ? `Queued ${sync.queued}` : `Saved on device ${sync.queued}`) : 'Synced'}
          </span>
          {justFlagged && <span className="ld-pill is-info">Shortage sent to dispatcher</span>}
        </div>
        {!isOnline && (
          <div className="ld-offline" role="status">
            <span className="ld-offline-icon"><Icon name="wifioff" size={26} /></span>
            <div>
              <strong>You are offline</strong>
              <p>Keep loading. Every check and shortage is saved on this device and sends by itself when you are back online.</p>
              <div className="ld-chips"><span className="ld-pill is-queued">{sync.queued} saved on device</span><span className="ld-pill">Last synced {lastSynced}</span></div>
            </div>
          </div>
        )}
        {rejected.map((r) => <div key={r.id} style={{ padding: '0 16px' }}><AlertBanner tone="danger" title="Refused by the server" action={<button type="button" onClick={() => void discard(r.id)}>Dismiss</button>}>{r.error}</AlertBanner></div>)}
        {screen === 'trips' && <TripsScreen trips={trips} sealed={sealed} planState={planState} lastSynced={lastSynced} activeTrip={activeForHome} onOpen={openTrip} />}
        {screen === 'loading' && <StopSequenceScreen trip={trip} sync={sync} expandedSeq={expandedSeq} onExpand={(q) => setExpandedSeq(expandedSeq === q ? -1 : q)} onBack={() => setScreen('trips')} onToggle={toggleItem} onFlag={startFlag} onFlagButton={flagButton} onReview={() => setScreen('ready')} />}
        {screen === 'flag' && <FlagShortageScreen key={flagItem.id} trip={trip} stopSeq={flagStop.seq} stopOutlet={flagStop.outlet} stopName={flagStop.name} item={flagItem} onBack={() => setScreen('loading')} onSend={sendFlag} />}
        {screen === 'ready' && <TripReadyScreen trip={trip} planState={planState} sealed={!!sealed[trip.id]} queued={sync.queued > 0} onReload={reload} onMarkReady={markReady} onOpenStop={(q) => { setExpandedSeq(q); setScreen('loading'); }} onBackToTrips={() => setScreen('trips')} />}
        <nav className="ld-tabs" aria-label="Loader navigation">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-on' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => goTab(tab.id)}>
              <Icon name={tabIcon[tab.id as keyof typeof tabIcon]} size={24} />
              <span>{tab.label[locale]}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
