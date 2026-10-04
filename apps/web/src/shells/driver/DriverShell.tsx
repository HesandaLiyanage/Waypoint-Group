import { useEffect, useState } from 'react';
import { ApiError, request } from '../../api/http';
import { useSync } from '../../context/SyncContext';
import { DONE_STATUSES, useDriverTrip } from './live';
import { AlertBanner, Badge, Button, Card, EmptyState, PageHeading, TextField } from '../../components/common';
import { receiptOutcome, validQuantities, type DriverTrip, type Receipt, type StopStatus } from './model';
import './driver.css';

type Screen = 'route' | 'stop' | 'unload' | 'handover' | 'issues' | 'report' | 'summary' | 'confirmed';
const screens: Screen[] = ['route', 'stop', 'unload', 'handover', 'issues', 'report', 'summary', 'confirmed'];
const readScreen = (): Screen => { const value = location.hash.split('/')[2] as Screen; return screens.includes(value) ? value : 'route'; };
const statusLabel: Record<StopStatus, string> = { pending: 'Upcoming', arrived: 'At outlet', delivered: 'Received in full', received_with_discrepancy: 'Received with discrepancy' };
const categories = ['Access blocked', 'Store closed / manager unavailable', 'Damaged goods', 'Quantity shortfall', 'Vehicle / road issue'];

export function DriverShell() {
  const { trip, ready } = useDriverTrip();
  const { workspaceError } = useSync();
  if (!trip) return <div className="driver-workspace">{workspaceError ? <AlertBanner tone="danger" title="Could not load your trip">{workspaceError}</AlertBanner> : <EmptyState title={ready ? 'No trip assigned' : 'Loading your trip'} description={ready ? 'No published trip is assigned to your vehicle yet. The dispatcher publishes the plan after loading is planned.' : 'Fetching your assigned route.'} />}</div>;
  return <DriverRun trip={trip} />;
}

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });

function DriverRun({ trip }: { trip: DriverTrip & { status: string; stopStatus: Record<string, string> } }) {
  const { send, pendingCount, rejected, workspace, refresh } = useSync();
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [statuses, setStatuses] = useState<Record<string, StopStatus>>({});
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [issueNote, setIssueNote] = useState('');
  const [photo, setPhoto] = useState<File>();
  const [photoUrl, setPhotoUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [parked, setParked] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = trip.status === 'departed' || trip.status === 'completed';
  const ended = trip.status === 'completed';
  const done = new Set(trip.stops.filter(s => DONE_STATUSES.includes(trip.stopStatus[s.id]) || receipts.some(r => r.stopId === s.id)).map(s => s.id));
  const issues = (workspace?.issues ?? []).filter((i: any) => trip.stops.some(s => s.id === i.stop_id));
  const completed = done.size;
  const stop = trip.stops.find(s => !done.has(s.id));
  const lastReceipt = receipts.at(-1);
  const isArrived = !!stop && (statuses[stop.id] === 'arrived' || trip.stopStatus[stop.id] === 'arrived');
  const amountValid = !!stop && validQuantities(stop.items, quantities);
  const acceptedTotal = Object.values(quantities).reduce((sum, amount) => sum + amount, 0);
  const discrepancy = !!stop && amountValid && receiptOutcome(stop.items, quantities) === 'received_with_discrepancy';
  const canHandover = !!stop && isArrived && checked.length === stop.items.length && amountValid && acceptedTotal > 0 && (!discrepancy || note.trim().length > 0);
  const activeTab = ['issues', 'report'].includes(screen) ? 'issues' : ['stop', 'unload', 'handover'].includes(screen) ? 'stop' : 'route';
  function go(next: Screen) { setError(''); location.hash = `/driver/${next}`; setScreen(next); window.scrollTo({ top: 0 }); }
  useEffect(() => { const update = () => { setScreen(readScreen()); setError(''); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => { if (!photo) { setPhotoUrl(''); return; } const url = URL.createObjectURL(photo); setPhotoUrl(url); return () => URL.revokeObjectURL(url); }, [photo]);
  // Commands go straight to the server so a wrong code or a changed plan is reported at once; with no network they are queued durably.
  async function command(body: Record<string, unknown>) {
    const payload = { ...body, plan_version: trip.planVersion, client_at: new Date().toISOString() };
    try {
      await request('/workflow/commands', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), ...payload }) });
    } catch (e) {
      if (e instanceof ApiError && e.network) { await send(payload as never); setNotice('No connection: saved on this phone and queued. It will send when coverage returns.'); return; }
      throw e;
    }
    await refresh();
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(false); }
  }
  function start() {
    void act(async () => { await command({ action: 'TRIP_DEPARTED', trip_id: trip.id }); go('stop'); });
  }
  function arrive() {
    if (!stop || !parked || !started) return;
    void act(async () => {
      await command({ action: 'STOP_ARRIVED', trip_id: trip.id, stop_id: stop.id });
      setStatuses(old => ({ ...old, [stop.id]: 'arrived' }));
      setQuantities(Object.fromEntries(stop.items.map(item => [item.sku, item.expected])));
      setChecked([]); setRecipient(''); setNote(''); setCode(''); go('unload');
    });
  }
  function confirm() {
    if (!stop || !canHandover || !recipient.trim()) { setError('Check the unloaded quantities and enter the recipient name.'); return; }
    const outcome = receiptOutcome(stop.items, quantities);
    void act(async () => {
      await command({ action: 'STOP_DELIVERED', trip_id: trip.id, stop_id: stop.id, recipient: recipient.trim(), code, note: note.trim(), lines: stop.items.map(item => ({ line_no: Number(item.sku), received_qty: quantities[item.sku] })) });
      setReceipts(old => [...old, { stopId: stop.id, recipient: recipient.trim(), quantities: { ...quantities }, note: note.trim(), outcome, recordedAt: new Date().toISOString() }]);
      setStatuses(old => ({ ...old, [stop.id]: outcome })); setParked(false); go('confirmed');
    });
  }
  function failStop() {
    if (!stop) return;
    void act(async () => { await command({ action: 'STOP_FAILED', trip_id: trip.id, stop_id: stop.id, note: issueNote.trim() }); setIssueNote(''); go('route'); });
  }
  function report(event: React.FormEvent) {
    event.preventDefault();
    if (!stop || !started || !issueNote.trim()) return;
    void act(async () => {
      await command({ action: 'ISSUE_REPORTED', trip_id: trip.id, stop_id: stop.id, status: category, note: issueNote.trim(), photo: photo ? await fileToDataUrl(photo) : undefined });
      setNotice('Issue sent to dispatch. The stop stays open until dispatch gives instructions.');
      setIssueNote(''); setPhoto(undefined); go('issues');
    });
  }
  const stopBanner = stop && <Card className="driver-stop-banner"><div className="driver-row"><Badge tone="info">Stop {trip.stops.indexOf(stop) + 1} of {trip.stops.length}</Badge><strong>{stop.outletId}</strong></div><h2>{stop.name}</h2><p>{stop.dock} · {stop.access}</p><div className="driver-facts"><div><small>Delivery window</small><strong>{stop.window}</strong></div><div><small>Planned arrival</small><strong>{stop.plannedArrival}</strong></div></div></Card>;
  return <div className="driver-workspace">
    {(pendingCount > 0 || rejected.length > 0) && <AlertBanner tone={rejected.length ? 'danger' : 'warning'} title={rejected.length ? `${rejected.length} action(s) were refused by the server` : `${pendingCount} action(s) waiting to send`}>{rejected[0]?.error ?? 'Saved on this phone; they send automatically when coverage returns.'}</AlertBanner>}
    {error && screen !== 'handover' && screen !== 'report' && <AlertBanner tone="danger" title={error} />}
    {notice && <div className="driver-notice" role="status">{notice}<Button variant="ghost" onClick={() => setNotice('')} aria-label="Dismiss notification">×</Button></div>}
    <div className="driver-title"><PageHeading eyebrow="DRIVER WORKSPACE" title={screen === 'route' ? 'My route' : screen === 'stop' ? 'Current stop' : screen === 'unload' ? 'Unload & check' : screen === 'handover' ? 'Confirm handover' : screen === 'report' ? 'Report a stop issue' : screen === 'issues' ? 'Issues' : screen === 'confirmed' ? 'Handover recorded' : 'Trip summary'} description="Use delivery controls only when safely parked." />{screen !== 'route' && <Button variant="ghost" onClick={() => go('route')}>← My route</Button>}</div>
    {screen === 'route' && <>
      <Card className="driver-hero"><Badge tone="info">{ended ? 'Trip finished' : started ? 'Route in progress' : trip.status === 'sealed' ? 'Loaded · ready for departure' : 'Waiting for loading'}</Badge><h2>{trip.depot} → {trip.stops[0]?.district}</h2><p>{trip.id} · Plan v{trip.planVersion}</p><div className="driver-row"><strong>Route progress</strong><span>{completed} / {trip.stops.length} received</span></div><progress aria-label="Stops received" value={completed} max={trip.stops.length} /><div className="driver-facts"><div><small>Vehicle</small><strong>{trip.vehicleId}</strong><span>{trip.vehicleType}</span></div><div><small>Vehicle limits</small><strong>{trip.weightCapacity} kg</strong><span>{trip.volumeCapacity} m³</span></div></div></Card>
      {!started && <Button disabled={trip.status !== 'sealed' || busy} onClick={start}>{trip.status === 'sealed' ? 'Start trip →' : 'Waiting for the loader to seal this trip'}</Button>}
      {started && stop && <Button onClick={() => go('stop')}>Continue to {stop.outletId} →</Button>}
      <div className="driver-row"><h2>Stops & sequence</h2><span>{trip.stops.length} deliveries</span></div>
      <div className="driver-stop-list">{trip.stops.map((item, index) => <Card key={item.id} className={stop?.id === item.id ? 'driver-current' : ''}><div className="driver-row"><span className="driver-sequence">{index + 1}</span><strong>{item.outletId}</strong><Badge tone={trip.stopStatus[item.id] === 'delivered' || trip.stopStatus[item.id] === 'receipt_confirmed' ? 'success' : ['delivered_short', 'receipt_disputed', 'failed'].includes(trip.stopStatus[item.id]) ? 'warning' : 'neutral'}>{({ pending: 'Upcoming', arrived: 'At outlet', delivered: 'Received in full', delivered_short: 'Received with discrepancy', receipt_confirmed: 'Confirmed by store', receipt_disputed: 'Disputed by store', failed: 'Not delivered' } as Record<string, string>)[trip.stopStatus[item.id] ?? 'pending'] ?? 'Upcoming'}</Badge></div><h3>{item.name}</h3><p>{item.items.reduce((sum, i) => sum + i.expected, 0)} units · {item.window}</p><p>{item.access} · {item.dock}</p>{stop?.id === item.id && started && <Button variant="secondary" onClick={() => go(isArrived ? 'unload' : 'stop')}>Open current stop</Button>}</Card>)}</div>
      <Button variant="secondary" onClick={() => go('summary')}>View trip summary</Button>
    </>}
    {['stop', 'unload', 'handover', 'report'].includes(screen) && (!stop || !started) && <EmptyState title={!stop ? 'All stops received' : 'Start your trip first'} description={!stop ? 'Review the trip summary before finishing.' : 'Review the assigned manifest before departure.'} action={<Button onClick={() => go(!stop ? 'summary' : 'route')}>Continue</Button>} />}
    {stop && started && <>
      {['stop', 'unload', 'handover', 'report'].includes(screen) && stopBanner}
      {screen === 'stop' && <>
        <AlertBanner tone="warning" title="All Fresh deliveries must arrive before 08:00">This includes ambient Fresh goods. Follow the earlier outlet closing time shown above.</AlertBanner>
        <Card><h2>Dock & access</h2><p>{stop.access}. {stop.dock}. Follow the outlet's receiving instructions.</p><p className="driver-muted">Street address, coordinates and contact details are not included in the dataset. Navigation and calling will be available when verified outlet contacts are connected.</p></Card>
        <Card><h2>Stop cargo</h2>{stop.items.map(item => <div className="driver-line" key={item.sku}><span>{item.name}<small>{item.temperature}</small></span><strong>{item.expected} units</strong></div>)}</Card>
        {!isArrived && <label className="driver-check"><input type="checkbox" checked={parked} onChange={e => setParked(e.target.checked)} />I am safely parked at the outlet</label>}
        <Button disabled={!isArrived && !parked} onClick={() => isArrived ? go('unload') : arrive()}>{isArrived ? 'Continue unloading' : 'Mark arrived at outlet'}</Button>
        <Button variant="secondary" onClick={() => { setCategory(categories[0]); go('report'); }}>Report access or delivery issue</Button>
      </>}
      {screen === 'unload' && (!isArrived ? <EmptyState title="Arrival required" description="Confirm you are safely parked at the outlet first." action={<Button onClick={() => go('stop')}>Go to arrival</Button>} /> : <>
        <div className="driver-row"><h2>Unload verification</h2><Badge>{checked.length} / {stop.items.length} checked</Badge></div>
        {stop.items.map(item => <Card key={item.sku} className="driver-cargo"><label className="driver-check"><input type="checkbox" checked={checked.includes(item.sku)} onChange={e => setChecked(old => e.target.checked ? [...old, item.sku] : old.filter(id => id !== item.sku))} /><span><strong>{item.name}</strong><small>{item.temperature} · {item.expected} units planned</small></span></label><TextField label={`Received units — ${item.name}`} type="number" inputMode="numeric" min={0} max={item.expected} step={1} value={Number.isNaN(quantities[item.sku]) ? '' : quantities[item.sku] ?? ''} onChange={e => setQuantities(old => ({ ...old, [item.sku]: e.target.value === '' ? NaN : Number(e.target.value) }))} /></Card>)}
        {!amountValid && <AlertBanner tone="warning" title="Check received quantities">Use whole numbers between zero and the planned quantity.</AlertBanner>}
        {amountValid && acceptedTotal === 0 && <AlertBanner tone="warning" title="No goods accepted">Report the failed delivery for dispatcher review. A receipt cannot confirm goods that were not received.</AlertBanner>}
        {discrepancy && <AlertBanner tone="warning" title="Receipt with discrepancy">Missing or damaged goods will remain recorded separately from the accepted quantities.</AlertBanner>}
        <label className="driver-field">{discrepancy ? 'Discrepancy details (required)' : 'Handover notes (optional)'}<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Which items are short or damaged? Record quantities and reason." /></label>
        <Button disabled={!canHandover} onClick={() => go('handover')}>Continue to receipt code →</Button><Button variant="secondary" onClick={() => { setCategory('Damaged goods'); go('report'); }}>Report a delivery issue</Button>
      </>)}
      {screen === 'handover' && (!canHandover ? <EmptyState title="Verify unloaded goods first" description="Every item needs a count and a check before handover." action={<Button onClick={() => go(isArrived ? 'unload' : 'stop')}>Review goods</Button>} /> : <>
        <AlertBanner title="Ask the store manager for the four-digit code">The manager sees it on their screen once you have arrived. The server checks it; five wrong tries lock the stop.</AlertBanner>
        <TextField label="Recipient name" value={recipient} onChange={e => setRecipient(e.target.value)} autoComplete="name" />
        <TextField label="Four-digit receipt code" className="driver-code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }} />
        <div className="driver-keypad">{['1','2','3','4','5','6','7','8','9','Clear','0','Delete'].map(key => <Button variant="secondary" key={key} onClick={() => { setError(''); setCode(old => key === 'Clear' ? '' : key === 'Delete' ? old.slice(0, -1) : (old + key).slice(0, 4)); }}>{key}</Button>)}</div>
        <Card><h3>{discrepancy ? 'Receiving with discrepancy' : 'Receiving in full'}</h3><p>{Object.values(quantities).reduce((a, b) => a + b, 0)} units accepted</p>{note && <p>{note}</p>}</Card>
        {error && <AlertBanner tone="danger" title={error} />}
        <Button disabled={code.length !== 4 || !recipient.trim() || busy} onClick={confirm}>Verify code & record handover</Button><Button variant="ghost" onClick={() => go('unload')}>Back to quantities</Button>
      </>)}
      {screen === 'report' && <form className="driver-stack" onSubmit={report}>
        <fieldset className="driver-options"><legend>Issue category</legend>{categories.map(option => <label className="driver-check" key={option}><input type="radio" name="category" value={option} checked={category === option} onChange={() => setCategory(option)} />{option}</label>)}</fieldset>
        <label className="driver-field">Details (required)<textarea required value={issueNote} onChange={e => setIssueNote(e.target.value)} placeholder="Describe what happened and what help you need from dispatch." /></label>
        <label className="driver-field">Photo evidence (optional)<input type="file" accept="image/*" capture="environment" onChange={e => { const file = e.target.files?.[0]; if (file && (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024)) { setError('Choose an image smaller than 2 MB.'); e.target.value = ''; return; } setPhoto(file); setError(''); }} /></label>
        {photoUrl && <div><img className="driver-photo" src={photoUrl} alt="Selected incident evidence" /><Button variant="ghost" onClick={() => setPhoto(undefined)}>Remove photo</Button></div>}
        {error && <AlertBanner tone="danger" title={error} />}
        <AlertBanner title="Dispatch decision needed">Reporting an issue does not mark the stop delivered, approve a shortfall or change the route. A blocked bay needs a safe alternative agreed with the outlet, or a dispatcher decision to wait, resequence or defer.</AlertBanner>
        <Button type="submit" disabled={!issueNote.trim() || busy}>Send issue to dispatch</Button>
        <Button variant="secondary" disabled={!issueNote.trim() || busy} onClick={failStop}>Record stop as not delivered</Button>
      </form>}
    </>}
    {screen === 'issues' && <>
      {stop && started && <Button onClick={() => go('report')}>Report current-stop issue</Button>}
      {issues.length === 0 ? <EmptyState title="No issues recorded" description="Report blocked access, damaged goods or shortfalls at the current stop." /> : issues.map(issue => <Card key={issue.id}><div className="driver-row"><strong>{trip.stops.find(s => s.id === issue.stop_id)?.outletId}</strong><Badge tone={issue.status === 'resolved' ? 'success' : 'warning'}>{issue.status === 'open' ? 'Sent · waiting for dispatch' : issue.status === 'ack' ? 'Dispatch acknowledged' : 'Resolved'}</Badge></div><h3>{String(issue.kind).replaceAll('_', ' ')}</h3><p>{issue.detail?.note}</p>{issue.detail?.issue_instruction && <p><strong>Dispatch instruction:</strong> {issue.detail.issue_instruction.note}</p>}</Card>)}
      {receipts.filter(r => r.outcome === 'received_with_discrepancy').map(r => <Card key={r.stopId}><Badge tone="warning">Receipt discrepancy</Badge><h3>{trip.stops.find(s => s.id === r.stopId)?.outletId}</h3><p>{r.note}</p></Card>)}
    </>}
    {screen === 'confirmed' && (lastReceipt ? <Card className="driver-success"><span className="driver-success-mark">✓</span><h2>{lastReceipt.outcome === 'delivered' ? 'Goods received in full' : 'Goods received with discrepancy'}</h2><p>{trip.stops.find(s => s.id === lastReceipt.stopId)?.outletId} · {lastReceipt.recipient}</p><p>{Object.values(lastReceipt.quantities).reduce((a, b) => a + b, 0)} units received</p><p>{lastReceipt.note}</p><p className="driver-muted">Recorded. The store manager can now confirm what arrived, and dispatch sees any discrepancy.</p><Button onClick={() => go(stop ? 'stop' : 'summary')}>{stop ? `Next stop · ${stop.outletId}` : 'View trip summary'}</Button></Card> : <EmptyState title="No handover yet" description="Complete the current stop's receipt first." action={<Button onClick={() => go('route')}>My route</Button>} />)}
    {screen === 'summary' && <>
      <Card className="driver-success"><h2>{ended ? 'Trip finished' : completed === trip.stops.length ? 'All stops received' : 'Trip in progress'}</h2><p>{trip.id}</p><div className="driver-facts"><div><small>Receipts</small><strong>{completed} / {trip.stops.length}</strong></div><div><small>Discrepancies</small><strong>{receipts.filter(r => r.outcome === 'received_with_discrepancy').length}</strong></div><div><small>Reported issues</small><strong>{issues.length}</strong></div><div><small>Accepted units</small><strong>{receipts.reduce((sum, r) => sum + Object.values(r.quantities).reduce((a, b) => a + b, 0), 0)}</strong></div></div></Card>
      {receipts.map(r => <Card key={r.stopId}><strong>{trip.stops.find(s => s.id === r.stopId)?.outletId}</strong><p>{statusLabel[r.outcome]} · {r.recipient}</p>{r.note && <p>{r.note}</p>}</Card>)}
            <Button disabled={completed !== trip.stops.length || ended || busy} onClick={() => void act(async () => { await command({ action: 'TRIP_COMPLETED', trip_id: trip.id }); })}>{ended ? 'Trip finished' : 'Finish trip'}</Button>
      {stop && <Button variant="secondary" onClick={() => go(started ? 'stop' : 'route')}>Continue deliveries</Button>}
    </>}
    <nav className="driver-bottom-nav" aria-label="Driver navigation">{[['route','My route'],['stop','Current stop'],['issues','Issues']].map(([id, label]) => <a key={id} href={`#/driver/${id}`} aria-current={activeTab === id ? 'page' : undefined}>{label}{id === 'issues' && issues.length > 0 ? ` (${issues.length})` : ''}</a>)}</nav>
  </div>;
}
