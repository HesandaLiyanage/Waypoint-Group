import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useSync } from '../../context/SyncContext';
import { roleNavigation } from '../../components/common';
import { initialTrips, type FlagKind, type Trip } from './mockData';
import { allItems, counts } from './helpers';
import { Icon } from './icons';
import { TripsScreen } from './TripsScreen';
import { StopSequenceScreen, type SyncState } from './StopSequenceScreen';
import { FlagShortageScreen } from './FlagShortageScreen';
import { TripReadyScreen } from './TripReadyScreen';
import './loader.css';

type Screen = 'trips' | 'loading' | 'flag' | 'ready';
const clock = () => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Colombo' }).format(new Date());

export function LoaderShell() {
  const { locale } = useI18n();
  const { isOnline: netOnline } = useSync();
  // "Go offline" button simulates a lost connection for the demo; the real browser state also counts.
  const [simOffline, setSimOffline] = useState(false);
  const isOnline = netOnline && !simOffline;
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [activeId, setActiveId] = useState('VEH014');
  const [screen, setScreen] = useState<Screen>('trips');
  const [expandedSeq, setExpandedSeq] = useState(5);
  const [flagItemId, setFlagItemId] = useState<string | null>(null);
  const [planState, setPlanState] = useState<'updated' | 'reloaded'>('updated');
  const [sealed, setSealed] = useState<Record<string, boolean>>({});
  const [sync, setSync] = useState<SyncState>({ queued: 0, syncing: 0, synced: 3 });
  const [lastSynced, setLastSynced] = useState('5:58 PM');
  const [justFlagged, setJustFlagged] = useState(false);

  const trip = trips.find((t) => t.id === activeId) ?? trips[0];

  // Local "outbox" simulation: actions queue first, then sync when online.
  const queue = () => setSync((s) => ({ ...s, queued: s.queued + 1 }));
  useEffect(() => {
    if (!isOnline || sync.queued === 0) return;
    const t = window.setTimeout(() => setSync((s) => ({ queued: 0, syncing: s.syncing + s.queued, synced: s.synced })), 900);
    return () => window.clearTimeout(t);
  }, [sync.queued, isOnline]);
  useEffect(() => {
    if (sync.syncing === 0) return;
    const t = window.setTimeout(() => {
      setSync((s) => ({ queued: s.queued, syncing: 0, synced: s.synced + s.syncing }));
      setLastSynced(clock());
      setJustFlagged(false);
    }, 1800);
    return () => window.clearTimeout(t);
  }, [sync.syncing]);

  const updateTrip = (fn: (t: Trip) => Trip) => setTrips((all) => all.map((t) => (t.id === trip.id ? fn(t) : t)));

  const openTrip = (id: string) => { setActiveId(id); const first = trips.find((t) => t.id === id); if (first) setExpandedSeq(first.stops.find((s) => s.items.some((i) => i.state !== 'loaded'))?.seq ?? first.stops[0].seq); setScreen('loading'); };
  const toggleItem = (itemId: string) => {
    updateTrip((t) => ({ ...t, stops: t.stops.map((s) => ({ ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, state: i.state === 'loaded' ? 'pending' : 'loaded' } : i)) })) }));
    queue();
  };
  const startFlag = (itemId: string) => { setFlagItemId(itemId); setScreen('flag'); };
  const flagButton = () => {
    const items = allItems(trip);
    const open = trip.stops.find((s) => s.seq === expandedSeq)?.items[0];
    startFlag((items.find((i) => i.state === 'flagged') ?? open ?? items[0]).id);
  };
  const sendFlag = (kind: FlagKind, found: number) => {
    if (!flagItemId) return;
    updateTrip((t) => ({ ...t, stops: t.stops.map((s) => ({ ...s, items: s.items.map((i) => (i.id === flagItemId ? { ...i, state: 'flagged', flag: { kind, found, sentAt: clock() } } : i)) })) }));
    queue();
    setJustFlagged(true);
    setScreen('loading');
  };
  const markReady = () => { setSealed((s) => ({ ...s, [trip.id]: true })); queue(); };

  const tabs = roleNavigation.loader;
  const activeTab = screen === 'trips' ? 'trips' : screen === 'flag' ? 'issues' : 'loading';
  const tabIcon = { trips: 'truck', loading: 'list', issues: 'flag' } as const;
  const goTab = (id: string) => { if (id === 'trips') setScreen('trips'); else if (id === 'loading') setScreen('loading'); else flagButton(); };

  const flagItem = useMemo(() => allItems(trip).find((i) => i.id === flagItemId) ?? allItems(trip)[0], [trip, flagItemId]);
  const flagStop = trip.stops.find((s) => s.items.some((i) => i.id === flagItem.id)) ?? trip.stops[0];
  const activeForHome = trips.find((t) => counts(t).pending > 0 && counts(t).handled > 0) ?? trips.find((t) => t.id === activeId) ?? trips[0];

  return (
    <div className="ld-root">
      <div className="ld-phone">
        <div className="ld-status" aria-live="polite">
          <span className={`ld-pill ${sync.syncing ? 'is-syncing' : sync.queued ? 'is-queued' : 'is-synced'}`}>
            <Icon name="check" size={16} /> {sync.syncing ? `Syncing ${sync.syncing}` : sync.queued ? (isOnline ? `Queued ${sync.queued}` : `Saved on device ${sync.queued}`) : 'Synced'}
          </span>
          <button type="button" className="ld-demo-toggle" aria-pressed={simOffline} onClick={() => setSimOffline((v) => !v)}>{simOffline ? 'Back online (demo)' : 'Go offline (demo)'}</button>
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
        {screen === 'trips' && <TripsScreen trips={trips} sealed={sealed} planState={planState} lastSynced={lastSynced} activeTrip={activeForHome} onOpen={openTrip} />}
        {screen === 'loading' && <StopSequenceScreen trip={trip} sync={sync} expandedSeq={expandedSeq} onExpand={(q) => setExpandedSeq(expandedSeq === q ? -1 : q)} onBack={() => setScreen('trips')} onToggle={toggleItem} onFlag={startFlag} onFlagButton={flagButton} onReview={() => setScreen('ready')} />}
        {screen === 'flag' && <FlagShortageScreen key={flagItem.id} trip={trip} stopSeq={flagStop.seq} stopOutlet={flagStop.outlet} stopName={flagStop.name} item={flagItem} onBack={() => setScreen('loading')} onSend={sendFlag} />}
        {screen === 'ready' && <TripReadyScreen trip={trip} planState={planState} sealed={!!sealed[trip.id]} queued={sync.queued > 0} onReload={() => setPlanState('reloaded')} onMarkReady={markReady} onOpenStop={(q) => { setExpandedSeq(q); setScreen('loading'); }} onBackToTrips={() => setScreen('trips')} />}
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
