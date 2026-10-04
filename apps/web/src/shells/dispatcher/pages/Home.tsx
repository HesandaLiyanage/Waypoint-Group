import { useState, type Dispatch } from 'react';
import { Badge, Button, Card, MetricCard, PageHeading, SelectField } from '../../../components/common';
import { deferred, type Action, type DispatchState } from '../model';
import { PageLink, path } from '../shared';
function Registrations({s,dispatch}:{s:DispatchState;dispatch:Dispatch<Action>}) {
  const [vehicle,setVehicle]=useState<Record<string,string>>({});
  if(!s.pendingUsers.length)return null;
  return <Card><div className="wp-card-heading"><h2>Registration requests</h2><Badge tone="warning">{s.pendingUsers.length} waiting</Badge></div>
    {s.pendingUsers.map(p=><div className="dp-stop-row" key={p.id}><div><strong>{p.name} · {p.role.replace('_',' ')}</strong><p className="dp-muted">{p.email}{p.phone?` · ${p.phone}`:''} · work ID {p.workId} · {p.outletId??p.depot}</p></div>
      <div className="wp-actions">{p.role==='driver'&&<SelectField label="Vehicle" value={vehicle[p.id]??''} onChange={e=>setVehicle(v=>({...v,[p.id]:e.target.value}))}><option value="">Assign vehicle</option>{s.vehicles.map(v=><option key={v.id} value={v.id}>{v.id} · {v.kind} · {v.temp}</option>)}</SelectField>}
        <Button disabled={p.role==='driver'&&!vehicle[p.id]} onClick={()=>dispatch({type:'user_decision',userId:p.id,decision:'approve',vehicleId:vehicle[p.id]})}>Approve</Button>
        <Button variant="ghost" onClick={()=>dispatch({type:'user_decision',userId:p.id,decision:'reject'})}>Reject</Button></div></div>)}
  </Card>;
}
export function Home({state:s,dispatch}:{state:DispatchState;dispatch:Dispatch<Action>}) {
  const warnings=s.warnings;const repeated=s.orders.filter(o=>o.skips>0&&(!s.generated||!o.trip));const openIssues=s.issues.filter(i=>i.status!=='resolved');
  const alertCount=openIssues.length+warnings.length+Number(repeated.length>0&&!s.recorded);
  const stages=[{title:'Order queue',detail:s.closed?'Queue locked for planning':'Review orders before the 16:00 cutoff',to:'orders',status:s.closed?'Complete':'Active'}, {title:'Capacity & plan',detail:s.generated?'Review trip assignments and constraints':'Allocate orders to available vehicles',to:'allocation',status:s.confirmed?'Complete':s.generated?'Active':'Pending'}, {title:'Deferral review',detail:s.recorded?'Reasons recorded for all deferred orders':'Review previous skips and next delivery dates',to:'deferrals',status:s.recorded?'Complete':s.generated?'Needs review':'Pending'}, {title:'Fleet tracking',detail:'Follow deliveries and resolve incidents',to:'tracking',status:s.confirmed?'Active':'Pending'}];
  const vehicles=new Set(s.trips.map(t=>t.vehicle)).size;
  return <><PageHeading eyebrow={`${s.depot} · Dispatch operations`} title="Fulfilment & dispatch" description={`Delivery day ${s.deliveryDate}`} actions={<><Badge tone={s.closed?'neutral':'warning'}>{s.closed?'Queue closed':'Queue cutoff · 16:00 LK'}</Badge><PageLink to="orders">Go to order queue →</PageLink></>} />
    <div className="wp-metrics-grid"><MetricCard label="Confirmed orders" value={s.orders.length} detail={`${s.orders.filter(o=>o.temp==='Ambient').length} ambient · ${s.orders.filter(o=>o.temp==='Chilled').length} chilled${s.lateCount?` · ${s.lateCount} after cutoff`:''}`} /><MetricCard label="Vehicles in the plan" value={vehicles} detail={s.generated?`${s.trips.length} trips planned`:'Generate a plan to allocate vehicles'} /><MetricCard label="Requiring attention" value={alertCount} badge={<Badge tone={alertCount?'warning':'success'}>{alertCount?'Action required':'All clear'}</Badge>} detail="Constraint violations, repeated deferrals and delivery incidents" /></div>
    <Card><div className="wp-card-heading"><h2>Dispatch workflow</h2><Badge tone="info">{s.confirmed?'Plan published':s.generated?'Planning & review':'Order intake'}</Badge></div><ol className="dp-workflow">{stages.map((stage,i)=><li key={stage.to}><a href={path(stage.to)}><span className="dp-step">{i+1}</span><Badge tone={stage.status==='Complete'?'success':stage.status==='Active'?'info':'neutral'}>{stage.status}</Badge><h3>{stage.title}</h3><p>{stage.detail}</p></a></li>)}</ol></Card>
    <Registrations s={s} dispatch={dispatch}/>
    <div className="wp-card-heading"><h2>Priority alerts</h2><span className="wp-description">Review the next action for each exception</span></div>
    {!s.recorded&&repeated.length>0&&<Card className="dp-alert-card"><div><Badge tone="warning">Repeated deferral risk</Badge><h3>{repeated[0].outlet} · {repeated[0].name}</h3><p>Skipped {repeated[0].skips} previous run(s). {repeated.length>1?`${repeated.length-1} more outlets are also at risk. `:''}Review these before publishing the plan.</p></div><PageLink secondary to={s.generated?'deferrals':'orders'}>Review priority orders</PageLink></Card>}
    {warnings.slice(0,5).map((w,i)=><Card key={w.order.id+i} className="dp-alert-card"><div><Badge tone="danger">Constraint violation</Badge><h3>{w.order.outlet} · {w.order.name}</h3><p>{w.reason}</p></div><PageLink to="allocation" secondary>Review assignment</PageLink></Card>)}
    {openIssues.map(i=>{const t=s.trips.find(t=>t.id===i.tripId);return <Card key={i.id} className="dp-alert-card"><div><Badge tone="danger">Delivery issue · {i.kind.replaceAll('_',' ')}</Badge><h3>{t?.vehicle??'Trip'} · {i.status==='open'?'Needs acknowledgement':'Awaiting outcome'}</h3><p>{i.note||'Review the incident and record the action taken.'}</p></div>{t&&<PageLink to={`trip/${t.id}`} secondary>Resolve issue</PageLink>}</Card>;})}
    <Card className="dp-summary-strip"><span><strong>{s.generated?s.orders.length-deferred(s).length:0}</strong> orders allocated</span><span><strong>{s.generated?deferred(s).length:0}</strong> proposed deferrals</span><span><strong>{s.trips.length}</strong> trips</span></Card>
    {s.audit.length>0&&<Card><h2>Decisions this session</h2><ol className="dp-info-log">{s.audit.map((entry,index)=><li key={index}>{entry}</li>)}</ol></Card>}
  </>;
}
