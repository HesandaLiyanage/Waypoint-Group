import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { AlertBanner, AppLayout, Badge, Button, CapacityBar, Card, EmptyState, MetricCard, Modal, PageHeading, Pagination, RoleNavigation, SegmentedControl, SelectField, SyncIndicator, TextField, roleNavigation, type OperationalRole, type Tone } from '../common';

const examples = [
  { id: 'OUT047', name: 'Waypoint Fresh · Gampaha', status: 'Needs review', tone: 'warning' as Tone },
  { id: 'OUT001', name: 'Waypoint Fresh · Colombo', status: 'Ready', tone: 'success' as Tone },
  { id: 'OUT032', name: 'Negombo Coastal Depot', status: 'Pending', tone: 'neutral' as Tone },
  { id: 'OUT019', name: 'Sea Street Express', status: 'Access restricted', tone: 'danger' as Tone },
];
export function ComponentPreview() {
  const { locale, setLocale } = useI18n();
  const [hash, setHash] = useState(window.location.hash);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [previewRole, setPreviewRole] = useState<OperationalRole>('dispatcher');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const change = () => setHash(window.location.hash);
    const network = () => setOnline(navigator.onLine);
    window.addEventListener('hashchange', change);
    window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, []);
  const activeId = hash.split('/')[2] || 'home';
  const activeItem = roleNavigation.dispatcher.find(item => item.id === activeId);
  const rows = examples.filter(row => `${row.id} ${row.name}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || row.tone === 'warning' || row.tone === 'danger'));
  return <AppLayout role="dispatcher" activeId={activeItem ? activeId : 'home'} locale={locale} onLocaleChange={setLocale} syncStatus={online ? 'idle' : 'offline'} account={{ name: 'Dispatch Desk', roleLabel: 'Dispatcher', detail: 'Peliyagoda · DC-01' }}>
    <PageHeading eyebrow="WAYPOINT / SHARED COMPONENTS" title="Dispatcher workspace" description="A preview of the common components for our delivery platform." actions={<Badge tone="info">Component preview</Badge>} />
    {activeId !== 'home' && <AlertBanner title={`${activeItem?.label[locale] || 'Navigation'} selected`}>This preview demonstrates navigation. Dispatcher workflow pages will be built next.</AlertBanner>}
    <div className="wp-metrics-grid"><MetricCard label="Orders confirmed" value="184" badge={<Badge tone="success">Ready to plan</Badge>} detail="Sample metric · order queue" /><MetricCard label="Fleet available" value={<>52 <small>/ 60</small></>} detail="Sample metric · fleet capacity" /><MetricCard label="Requiring attention" value="3" badge={<Badge tone="warning">Needs review</Badge>} detail="Sample metric · priority alerts" /></div>
    <div className="wp-preview-grid">
      <Card><h2>Actions & status</h2><p className="wp-description">Consistent controls, clear feedback.</p><div className="wp-demo-row"><Button onClick={() => { setSaved(false); setOpen(true); }}>Open confirmation</Button><Button variant="secondary" onClick={() => { setSearch(''); setPage(1); setFilter('all'); setSaved(false); }}>Reset preview</Button><Button disabled>Unavailable</Button></div><div className="wp-demo-row">{(['success', 'warning', 'danger', 'info', 'neutral'] as const).map((tone, index) => <Badge key={tone} tone={tone}>{['Confirmed', 'Needs review', 'Issue flagged', 'In transit', 'Pending'][index]}</Badge>)}</div><div className="wp-demo-row"><SyncIndicator status="connected" /><SyncIndicator status="syncing" pendingCount={2} /><SyncIndicator status="offline" /></div>{saved && <AlertBanner tone="success" title="Preview confirmed">The confirmation component is working. No delivery data was changed.</AlertBanner>}</Card>
      <Card><h2>Capacity indicators</h2><p className="wp-description">Reusable vehicle and trip load summaries.</p><div className="wp-capacity-stack"><CapacityBar label="Weight load" value={1840} maximum={2200} unit="kg" /><CapacityBar label="Cubic volume" value={14.2} maximum={16} unit="m³" /><CapacityBar label="Fresh trip time" value={250} maximum={270} unit="min" tone="warning" /></div></Card>
    </div>
    <AlertBanner tone="warning" title="Review required before confirming a plan">Warnings keep the constraint visible alongside the next action.</AlertBanner>
    <Card className="wp-table-card"><div className="wp-card-heading"><div><h2>Search, filters & tables</h2><p className="wp-description">Example outlet records for reviewing the shared controls.</p></div><SegmentedControl label="Example records" value={filter} onChange={value => { setFilter(value); setPage(1); }} options={[{ value: 'all', label: 'All records' }, { value: 'attention', label: 'Needs attention' }]} /></div><div className="wp-table-toolbar"><TextField label="Search outlets" type="search" placeholder="Search name or outlet code…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div>{rows.length ? <div className="wp-table-scroll" tabIndex={0} role="region" aria-label="Example outlets"><table className="wp-table"><thead><tr><th scope="col">Outlet</th><th scope="col">Name</th><th scope="col">Status</th></tr></thead><tbody>{rows.slice((page - 1) * 2, page * 2).map(row => <tr key={row.id}><th scope="row">{row.id}</th><td>{row.name}</td><td><Badge tone={row.tone}>{row.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No matching outlets" description="Try another name or clear the filters." action={<Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); setPage(1); }}>Clear filters</Button>} />}<Pagination page={page} pageSize={2} total={rows.length} onChange={setPage} /></Card>
    <Card><div className="wp-card-heading"><div><h2>Role navigation preview</h2><p className="wp-description">One navigation component, with menu options for each operational role.</p></div><SelectField label="Preview menu for" value={previewRole} onChange={event => setPreviewRole(event.target.value as OperationalRole)}><option value="dispatcher">Dispatcher</option><option value="loader">Loader</option><option value="driver">Driver</option><option value="store_manager">Store manager</option></SelectField></div><div className="wp-menu-preview"><RoleNavigation role={previewRole} activeId={roleNavigation[previewRole][0].id} locale={locale} items={roleNavigation[previewRole].map(item => ({ ...item, href: `#/preview/${item.id}` }))} /></div></Card>
    <Modal open={open} onClose={() => setOpen(false)} title="Confirm preview action" description="A shared dialog for deliberate actions across the platform." footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => { setOpen(false); setSaved(true); }}>Confirm preview</Button></>}><AlertBanner title="Component demonstration">This only updates the preview. No plan is published and no notification is sent.</AlertBanner></Modal>
  </AppLayout>;
}
