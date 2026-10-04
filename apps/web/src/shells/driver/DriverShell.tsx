import { useEffect, useState } from 'react';
import { AlertBanner, Badge, Button, Card, EmptyState, PageHeading, TextField } from '../../components/common';
import { DEMO_RECEIPT_CODE, demoTrip as trip } from './demo';
import { receiptOutcome, validQuantities, type Issue, type Receipt, type StopStatus } from './model';
import './driver.css';

type Screen = 'route' | 'stop' | 'unload' | 'handover' | 'issues' | 'report' | 'summary' | 'confirmed';
const screens: Screen[] = ['route', 'stop', 'unload', 'handover', 'issues', 'report', 'summary', 'confirmed'];
const readScreen = (): Screen => { const value = location.hash.split('/')[2] as Screen; return screens.includes(value) ? value : 'route'; };
const statusLabel: Record<StopStatus, string> = { pending: 'Upcoming', arrived: 'At outlet', delivered: 'Received in full', received_with_discrepancy: 'Received with discrepancy' };
const categories = ['Access blocked', 'Store closed / manager unavailable', 'Damaged goods', 'Quantity shortfall', 'Vehicle / road issue'];

export function DriverShell() {
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [statuses, setStatuses] = useState<Record<string, StopStatus>>({});
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
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
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const completed = receipts.length;
  const stop = trip.stops.find(s => !receipts.some(r => r.stopId === s.id));
  const lastReceipt = receipts.at(-1);
  const isArrived = !!stop && statuses[stop.id] === 'arrived';
  const amountValid = !!stop && validQuantities(stop.items, quantities);
  const acceptedTotal = Object.values(quantities).reduce((sum, amount) => sum + amount, 0);
  const discrepancy = !!stop && amountValid && receiptOutcome(stop.items, quantities) === 'received_with_discrepancy';
  const canHandover = !!stop && isArrived && checked.length === stop.items.length && amountValid && acceptedTotal > 0 && (!discrepancy || note.trim().length > 0);
  const activeTab = ['issues', 'report'].includes(screen) ? 'issues' : ['stop', 'unload', 'handover'].includes(screen) ? 'stop' : 'route';
  function go(next: Screen) { setError(''); location.hash = `/driver/${next}`; setScreen(next); window.scrollTo({ top: 0 }); }
  useEffect(() => { const update = () => { setScreen(readScreen()); setError(''); }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => { if (!photo) { setPhotoUrl(''); return; } const url = URL.createObjectURL(photo); setPhotoUrl(url); return () => URL.revokeObjectURL(url); }, [photo]);
  function arrive() {
    if (!stop || !parked || !started) return;
    setStatuses(old => ({ ...old, [stop.id]: 'arrived' }));
    setQuantities(Object.fromEntries(stop.items.map(item => [item.sku, item.expected])));
    setChecked([]); setRecipient(''); setNote(''); setCode(''); go('unload');
  }
  function confirm() {
    if (!stop || !canHandover || !recipient.trim()) { setError('Check the unloaded quantities and enter the recipient name.'); return; }
    if (code !== DEMO_RECEIPT_CODE) { setError('That demo code is incorrect. Use 4829.'); return; }
    const outcome = receiptOutcome(stop.items, quantities);
    setReceipts(old => [...old, { stopId: stop.id, recipient: recipient.trim(), quantities: { ...quantities }, note: note.trim(), outcome, recordedAt: new Date().toISOString() }]);
    setStatuses(old => ({ ...old, [stop.id]: outcome })); setParked(false); go('confirmed');
  }
  function report(event: React.FormEvent) {
    event.preventDefault();
    if (!stop || !started || !issueNote.trim()) return;
    setIssues(old => [...old, { id: crypto.randomUUID(), stopId: stop.id, category, note: issueNote.trim(), photo, createdAt: new Date().toISOString() }]);
    setNotice('Issue recorded in this demo session. It has not been sent to dispatch. The stop remains open.');
    setIssueNote(''); setPhoto(undefined); go('issues');
  }
  const stopBanner = stop && <Card className="driver-stop-banner"><div className="driver-row"><Badge tone="info">Stop {trip.stops.indexOf(stop) + 1} of {trip.stops.length}</Badge><strong>{stop.outletId}</strong></div><h2>{stop.name}</h2><p>{stop.dock} · {stop.access}</p><div className="driver-facts"><div><small>Delivery window</small><strong>{stop.window}</strong></div><div><small>Planned arrival</small><strong>{stop.plannedArrival}</strong></div></div></Card>;
  return <div className="driver-workspace">
    <AlertBanner title="Driver demo · 22 June 2026">Official outlet, vehicle and calendar data; sample route and cargo. Actions last until refresh and are not synchronized.</AlertBanner>
    {notice && <div className="driver-notice" role="status">{notice}<Button variant="ghost" onClick={() => setNotice('')} aria-label="Dismiss notification">×</Button></div>}
    <div className="driver-title"><PageHeading eyebrow="DRIVER WORKSPACE" title={screen === 'route' ? 'My route' : screen === 'stop' ? 'Current stop' : screen === 'unload' ? 'Unload & check' : screen === 'handover' ? 'Confirm handover' : screen === 'report' ? 'Report a stop issue' : screen === 'issues' ? 'Issues' : screen === 'confirmed' ? 'Handover recorded' : 'Trip summary'} description="Use delivery controls only when safely parked." />{screen !== 'route' && <Button variant="ghost" onClick={() => go('route')}>← My route</Button>}</div>
    {screen === 'route' && <>
      <Card className="driver-hero"><Badge tone="info">{ended ? 'Trip finished' : started ? 'Route in progress' : 'Ready for departure · demo'}</Badge><h2>{trip.depot} → Colombo</h2><p>{trip.id} · Plan v{trip.planVersion}</p><div className="driver-row"><strong>Route progress</strong><span>{completed} / {trip.stops.length} received</span></div><progress aria-label="Stops received" value={completed} max={trip.stops.length} /><div className="driver-facts"><div><small>Vehicle</small><strong>{trip.vehicleId}</strong><span>{trip.vehicleType}</span></div><div><small>Vehicle limits</small><strong>{trip.weightCapacity} kg</strong><span>{trip.volumeCapacity} m³</span></div></div></Card>
      {!started && <Button onClick={() => { setStarted(true); go('stop'); }}>Start demo trip →</Button>}
      {started && stop && <Button onClick={() => go('stop')}>Continue to {stop.outletId} →</Button>}
      <div className="driver-row"><h2>Stops & sequence</h2><span>{trip.stops.length} deliveries</span></div>
      <div className="driver-stop-list">{trip.stops.map((item, index) => <Card key={item.id} className={stop?.id === item.id ? 'driver-current' : ''}><div className="driver-row"><span className="driver-sequence">{index + 1}</span><strong>{item.outletId}</strong><Badge tone={statuses[item.id] === 'delivered' ? 'success' : statuses[item.id] === 'received_with_discrepancy' ? 'warning' : 'neutral'}>{statusLabel[statuses[item.id] || 'pending']}</Badge></div><h3>{item.name}</h3><p>{item.items.reduce((sum, i) => sum + i.expected, 0)} crates · {item.window}</p><p>{item.access} · {item.dock}</p>{stop?.id === item.id && started && <Button variant="secondary" onClick={() => go(isArrived ? 'unload' : 'stop')}>Open current stop</Button>}</Card>)}</div>
      <Button variant="secondary" onClick={() => go('summary')}>View trip summary</Button>
    </>}
    {['stop', 'unload', 'handover', 'report'].includes(screen) && (!stop || !started) && <EmptyState title={!stop ? 'All stops received' : 'Start your trip first'} description={!stop ? 'Review the trip summary before finishing.' : 'Review the assigned manifest before departure.'} action={<Button onClick={() => go(!stop ? 'summary' : 'route')}>Continue</Button>} />}
    {stop && started && <>
      {['stop', 'unload', 'handover', 'report'].includes(screen) && stopBanner}
      {screen === 'stop' && <>
        <AlertBanner tone="warning" title="All Fresh deliveries must arrive before 08:00">This includes ambient Fresh goods. Follow the earlier outlet closing time shown above.</AlertBanner>
        <Card><h2>Dock & access</h2><p>{stop.access}. {stop.dock}. Follow the outlet's receiving instructions.</p><p className="driver-muted">Street address, coordinates and contact details are not included in the dataset. Navigation and calling will be available when verified outlet contacts are connected.</p></Card>
        <Card><h2>Stop cargo</h2>{stop.items.map(item => <div className="driver-line" key={item.sku}><span>{item.name}<small>{item.temperature}</small></span><strong>{item.expected} crates</strong></div>)}</Card>
        {!isArrived && <label className="driver-check"><input type="checkbox" checked={parked} onChange={e => setParked(e.target.checked)} />I am safely parked at the outlet</label>}
        <Button disabled={!isArrived && !parked} onClick={() => isArrived ? go('unload') : arrive()}>{isArrived ? 'Continue unloading' : 'Mark arrived at outlet'}</Button>
        <Button variant="secondary" onClick={() => { setCategory(categories[0]); go('report'); }}>Report access or delivery issue</Button>
      </>}
      {screen === 'unload' && (!isArrived ? <EmptyState title="Arrival required" description="Confirm you are safely parked at the outlet first." action={<Button onClick={() => go('stop')}>Go to arrival</Button>} /> : <>
        <div className="driver-row"><h2>Unload verification</h2><Badge>{checked.length} / {stop.items.length} checked</Badge></div>
        {stop.items.map(item => <Card key={item.sku} className="driver-cargo"><label className="driver-check"><input type="checkbox" checked={checked.includes(item.sku)} onChange={e => setChecked(old => e.target.checked ? [...old, item.sku] : old.filter(id => id !== item.sku))} /><span><strong>{item.name}</strong><small>{item.temperature} · {item.expected} crates planned</small></span></label><TextField label={`Received crates — ${item.name}`} type="number" inputMode="numeric" min={0} max={item.expected} step={1} value={Number.isNaN(quantities[item.sku]) ? '' : quantities[item.sku] ?? ''} onChange={e => setQuantities(old => ({ ...old, [item.sku]: e.target.value === '' ? NaN : Number(e.target.value) }))} /></Card>)}
        {!amountValid && <AlertBanner tone="warning" title="Check received quantities">Use whole numbers between zero and the planned quantity.</AlertBanner>}
        {amountValid && acceptedTotal === 0 && <AlertBanner tone="warning" title="No goods accepted">Report the failed delivery for dispatcher review. A receipt cannot confirm goods that were not received.</AlertBanner>}
        {discrepancy && <AlertBanner tone="warning" title="Receipt with discrepancy">Missing or damaged goods will remain recorded separately from the accepted quantities.</AlertBanner>}
        <label className="driver-field">{discrepancy ? 'Discrepancy details (required)' : 'Handover notes (optional)'}<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Which items are short or damaged? Record quantities and reason." /></label>
        <Button disabled={!canHandover} onClick={() => go('handover')}>Continue to receipt code →</Button><Button variant="secondary" onClick={() => { setCategory('Damaged goods'); go('report'); }}>Report a delivery issue</Button>
      </>)}
      {screen === 'handover' && (!canHandover ? <EmptyState title="Verify unloaded goods first" description="Every item needs a count and a check before handover." action={<Button onClick={() => go(isArrived ? 'unload' : 'stop')}>Review goods</Button>} /> : <>
        <AlertBanner title="Ask the recipient for the four-digit code">Demo code: <strong>4829</strong>. SMS and server verification are not connected.</AlertBanner>
        <TextField label="Recipient name" value={recipient} onChange={e => setRecipient(e.target.value)} autoComplete="name" />
        <TextField label="Four-digit receipt code" className="driver-code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }} />
        <div className="driver-keypad">{['1','2','3','4','5','6','7','8','9','Clear','0','Delete'].map(key => <Button variant="secondary" key={key} onClick={() => { setError(''); setCode(old => key === 'Clear' ? '' : key === 'Delete' ? old.slice(0, -1) : (old + key).slice(0, 4)); }}>{key}</Button>)}</div>
        <Card><h3>{discrepancy ? 'Receiving with discrepancy' : 'Receiving in full'}</h3><p>{Object.values(quantities).reduce((a, b) => a + b, 0)} crates accepted</p>{note && <p>{note}</p>}</Card>
        {error && <AlertBanner tone="danger" title={error} />}
        <Button disabled={code.length !== 4 || !recipient.trim()} onClick={confirm}>Verify demo code & record handover</Button><Button variant="ghost" onClick={() => go('unload')}>Back to quantities</Button>
      </>)}
      {screen === 'report' && <form className="driver-stack" onSubmit={report}>
        <fieldset className="driver-options"><legend>Issue category</legend>{categories.map(option => <label className="driver-check" key={option}><input type="radio" name="category" value={option} checked={category === option} onChange={() => setCategory(option)} />{option}</label>)}</fieldset>
        <label className="driver-field">Details (required)<textarea required value={issueNote} onChange={e => setIssueNote(e.target.value)} placeholder="Describe what happened and what help you need from dispatch." /></label>
        <label className="driver-field">Photo evidence (optional)<input type="file" accept="image/*" capture="environment" onChange={e => { const file = e.target.files?.[0]; if (file && (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) { setError('Choose an image smaller than 5 MB.'); e.target.value = ''; return; } setPhoto(file); setError(''); }} /></label>
        {photoUrl && <div><img className="driver-photo" src={photoUrl} alt="Selected incident evidence" /><Button variant="ghost" onClick={() => setPhoto(undefined)}>Remove photo</Button></div>}
        {error && <AlertBanner tone="danger" title={error} />}
        <AlertBanner title="Dispatch decision needed">Reporting an issue does not mark the stop delivered, approve a shortfall or change the route. A blocked bay needs a safe alternative agreed with the outlet, or a dispatcher decision to wait, resequence or defer.</AlertBanner>
        <Button type="submit" disabled={!issueNote.trim() || !!error}>Record issue in demo</Button>
      </form>}
    </>}
    {screen === 'issues' && <>
      {stop && started && <Button onClick={() => go('report')}>Report current-stop issue</Button>}
      {issues.length === 0 ? <EmptyState title="No issues recorded" description="Report blocked access, damaged goods or shortfalls at the current stop." /> : issues.map(issue => <Card key={issue.id}><div className="driver-row"><strong>{trip.stops.find(s => s.id === issue.stopId)?.outletId}</strong><Badge tone="warning">Demo · not sent</Badge></div><h3>{issue.category}</h3><p>{issue.note}</p>{issue.photo && <p>Photo retained for this session: {issue.photo.name}</p>}<small>Dispatcher acknowledgment pending integration</small></Card>)}
      {receipts.filter(r => r.outcome === 'received_with_discrepancy').map(r => <Card key={r.stopId}><Badge tone="warning">Receipt discrepancy</Badge><h3>{trip.stops.find(s => s.id === r.stopId)?.outletId}</h3><p>{r.note}</p></Card>)}
    </>}
    {screen === 'confirmed' && (lastReceipt ? <Card className="driver-success"><span className="driver-success-mark">✓</span><h2>{lastReceipt.outcome === 'delivered' ? 'Goods received in full' : 'Goods received with discrepancy'}</h2><p>{trip.stops.find(s => s.id === lastReceipt.stopId)?.outletId} · {lastReceipt.recipient}</p><p>{Object.values(lastReceipt.quantities).reduce((a, b) => a + b, 0)} crates received</p><p>{lastReceipt.note}</p><p className="driver-muted">Recorded in this demo session. Store and dispatcher updates require backend integration.</p><Button onClick={() => go(stop ? 'stop' : 'summary')}>{stop ? `Next stop · ${stop.outletId}` : 'View trip summary'}</Button></Card> : <EmptyState title="No handover yet" description="Complete the current stop's receipt first." action={<Button onClick={() => go('route')}>My route</Button>} />)}
    {screen === 'summary' && <>
      <Card className="driver-success"><h2>{ended ? 'Trip finished in demo' : completed === trip.stops.length ? 'All stops received' : 'Trip in progress'}</h2><p>{trip.id}</p><div className="driver-facts"><div><small>Receipts</small><strong>{completed} / {trip.stops.length}</strong></div><div><small>Discrepancies</small><strong>{receipts.filter(r => r.outcome === 'received_with_discrepancy').length}</strong></div><div><small>Reported issues</small><strong>{issues.length}</strong></div><div><small>Accepted crates</small><strong>{receipts.reduce((sum, r) => sum + Object.values(r.quantities).reduce((a, b) => a + b, 0), 0)}</strong></div></div></Card>
      {receipts.map(r => <Card key={r.stopId}><strong>{trip.stops.find(s => s.id === r.stopId)?.outletId}</strong><p>{statusLabel[r.outcome]} · {r.recipient}</p>{r.note && <p>{r.note}</p>}</Card>)}
      <AlertBanner title="No server synchronization yet">Receipts and issues are held in memory. Refreshing clears this demonstration. Open issues are not resolved by finishing the trip.</AlertBanner>
      <Button disabled={completed !== trip.stops.length || ended} onClick={() => setEnded(true)}>{ended ? 'Trip finished' : 'Finish demo trip'}</Button>
      {stop && <Button variant="secondary" onClick={() => go(started ? 'stop' : 'route')}>Continue deliveries</Button>}
    </>}
    <nav className="driver-bottom-nav" aria-label="Driver navigation">{[['route','My route'],['stop','Current stop'],['issues','Issues']].map(([id, label]) => <a key={id} href={`#/driver/${id}`} aria-current={activeTab === id ? 'page' : undefined}>{label}{id === 'issues' && issues.length > 0 ? ` (${issues.length})` : ''}</a>)}</nav>
  </div>;
}
