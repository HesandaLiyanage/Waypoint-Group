import { useState, type Dispatch } from 'react';
import { AlertBanner, Badge, Button, Card, EmptyState, PageHeading, Pagination, SelectField, TextField } from '../../../components/common';
import { IssueActions } from './IssueActions';
import type { Action, DispatchState, Trip } from '../model';
import { exportCsv, PageLink, Table } from '../shared';
const DONE=['delivered','delivered_short','receipt_confirmed','receipt_disputed','failed'];
const TRIP_LABEL:Record<string,string>={planned:'Planned',loading:'Loading',sealed:'Loaded · ready',departed:'In transit',completed:'Completed',aborted:'Aborted'};
function tripStatus(s:DispatchState,t:Trip){
  const issue=s.issues.filter(i=>i.tripId===t.id&&i.status!=='resolved')[0];
  if(issue)return issue.status==='open'?'Issue flagged':issue.instruction?'Awaiting outcome':'Acknowledged';
  return TRIP_LABEL[t.status]??t.status;
}
const done=(t:Trip)=>t.stops.filter(x=>DONE.includes(x.status)).length;
function statusTone(status:string) { return status==='Issue flagged'?'danger':status==='Acknowledged'||status==='Awaiting outcome'?'warning':status==='Completed'?'success':status==='In transit'?'info':'neutral'; }
export function Tracking({state:s}:{state:DispatchState}) {
  const [search,setSearch]=useState(''),[district,setDistrict]=useState('all'),[status,setStatus]=useState('all'),[page,setPage]=useState(1);
  const live=s.confirmed?s.trips:[];
  const rows=live.map(t=>({t,status:tripStatus(s,t)})).filter(({t,status:st})=>(`${t.vehicle} ${t.district}`).toLowerCase().includes(search.toLowerCase())&&(district==='all'||t.district===district)&&(status==='all'||st===status));
  const open=s.issues.filter(i=>i.status!=='resolved');
  return <><PageHeading eyebrow="Fleet operations" title="Live tracking" description={`Trips for ${s.deliveryDate}. Progress updates as drivers record stops.`} actions={<Button variant="secondary" disabled={!rows.length} onClick={()=>exportCsv('dispatch-log.csv',[['Trip','Vehicle','District','Stops done','Status'],...rows.map(({t,status:st})=>[t.code,t.vehicle,t.district,`${done(t)}/${t.stops.length}`,st])])}>Export dispatch log</Button>}/>
    {open.map(i=>{const t=s.trips.find(t=>t.id===i.tripId);return <AlertBanner key={i.id} tone="danger" title={`${t?.vehicle??'Trip'} · ${i.kind.replaceAll('_',' ')}`} action={t&&<PageLink to={`trip/${t.id}`}>Resolve issue →</PageLink>}>{i.note||'The driver needs instructions.'}</AlertBanner>;})}
    {!s.confirmed?<EmptyState title="No published plan yet" description="Trips appear here once the allocation plan is published." action={<PageLink to="allocation">Go to allocation plan</PageLink>}/>:
    <Card className="wp-table-card"><div className="dp-filters"><TextField label="Search fleet" type="search" placeholder="Vehicle or district" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/><SelectField label="District" value={district} onChange={e=>{setDistrict(e.target.value);setPage(1);}}><option value="all">All districts</option>{[...new Set(live.map(t=>t.district))].sort().map(d=><option key={d}>{d}</option>)}</SelectField><SelectField label="Delivery status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">All statuses</option>{[...Object.values(TRIP_LABEL),'Issue flagged','Acknowledged','Awaiting outcome'].map(d=><option key={d}>{d}</option>)}</SelectField></div>
    {rows.length?<Table label="Fleet tracking" headings={['Vehicle','District','Stops','Last ETA (LK)','Status','Action']}>{rows.slice((page-1)*8,page*8).map(({t,status:st})=><tr key={t.id}><th scope="row">{t.vehicle}<span className="dp-cell-title">{t.brand} · trip {t.tripNo}</span></th><td>{t.district}</td><td>{done(t)} / {t.stops.length}</td><td>{t.eta||'–'}</td><td><Badge tone={statusTone(st)}>{st}</Badge></td><td><PageLink to={`trip/${t.id}`} secondary>View trip</PageLink></td></tr>)}</Table>:<EmptyState title="No matching trips" description="Try another district, status or search." action={<Button variant="secondary" onClick={()=>{setSearch('');setDistrict('all');setStatus('all');setPage(1);}}>Clear filters</Button>}/>}
    <Pagination page={page} pageSize={8} total={rows.length} onChange={setPage}/></Card>}</>;
}
export function TripDetail({id,state:s,dispatch}:{id:string;state:DispatchState;dispatch:Dispatch<Action>}) {
  const trip=s.trips.find(t=>t.id===id);
  if(!trip)return <EmptyState title="Trip not found" description="Select a trip from fleet tracking." action={<PageLink to="tracking">Back to tracking</PageLink>}/>;
  const issues=s.issues.filter(i=>i.tripId===trip.id);const openCount=issues.filter(i=>i.status!=='resolved').length;
  const label=(st:string,stopId:string)=>issues.some(i=>i.stopId===stopId&&i.status!=='resolved')?'Issue flagged':st==='delivered'?'Delivered':st==='delivered_short'?'Delivered · short':st==='failed'?'Failed':st==='arrived'?'Arrived':st.startsWith('receipt')?'Receipt recorded':'Pending';
  return <><div><PageLink to="tracking" secondary>← Back to tracking</PageLink></div><PageHeading title={`Trip detail · ${trip.code}`} description={`${trip.vehicle} · ${s.depot} → ${trip.district} · ${trip.brand} · departs ${trip.depart} LK`} actions={<Badge tone={openCount?'danger':'info'}>{openCount?`${openCount} open issue(s)`:TRIP_LABEL[trip.status]??trip.status}</Badge>}/><div className="dp-detail-grid"><Card><h2>Stop sequence</h2><p className="wp-description">{trip.stops.length} stops · {done(trip)} complete</p><ol className="dp-timeline">{trip.stops.map((st,i)=>{const o=s.orders.find(o=>o.uid===st.orderUid);const l=label(st.status,st.id);return <li key={st.id} className={l==='Issue flagged'?'dp-incident':''}><span className="dp-step">{i+1}</span><div><strong>{o?.outlet} · {o?.name}</strong><p className="dp-muted">{o?.id} · ETA {st.eta||'–'} · window closes {st.windowClose}</p></div><Badge tone={l==='Delivered'||l.startsWith('Receipt')?'success':l==='Issue flagged'||l==='Failed'||l.includes('short')?'danger':'neutral'}>{l}</Badge></li>;})}</ol></Card>
    <Card>{issues.length?issues.map(i=><IssueActions key={i.id} issue={i} dispatch={dispatch}/>):<><h2>Delivery progress</h2><p className="wp-description">{done(trip)} of {trip.stops.length} stops recorded.</p><AlertBanner title="No open issues">No dispatcher action is required for this trip.</AlertBanner></>}</Card></div></>;
}
