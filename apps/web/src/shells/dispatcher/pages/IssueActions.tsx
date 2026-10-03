import { useState, type Dispatch } from 'react';
import { AlertBanner, Button, Modal, SelectField, TextField } from '../../../components/common';
import type { Action, DispatchState, Instruction } from '../model';
const labels:Record<Instruction['action'],string>={alternate:'Agree an alternative unloading point',wait:'Hold briefly and reassess',reattempt:'Request a validated reattempt / route change',return:'Return affected goods and arrange next run'};
const guidance:Record<Instruction['action'],string>={
  alternate:'First check with the outlet whether another approved unloading point is available. Confirm vehicle access, safe unloading and chilled handling. Keep the driver safely stopped while coordinating.',
  wait:'Use a short, agreed review time while refrigeration is maintained. If access is still blocked, reassess before the outlet window closes. Do not wait indefinitely.',
  reattempt:'Request a revised sequence only after checking remaining outlet windows, travel time, fuel and load access. A loaded vehicle cannot be freely rearranged. Keep this pending until a feasible revision is confirmed.',
  return:'If no feasible unloading or reattempt is available, coordinate return of the affected goods and review the next operating run with the store. Do not record delivery or receipt; the driver records the actual outcome.',
};
export function IssueActions({state:s,dispatch}:{state:DispatchState;dispatch:Dispatch<Action>}) {
  const [action,setAction]=useState<Instruction['action']>('alternate'),[note,setNote]=useState(''),[reviewTime,setReviewTime]=useState('06:25'),[coordinated,setCoordinated]=useState(false),[outcome,setOutcome]=useState(''),[verified,setVerified]=useState(false),[confirm,setConfirm]=useState(false);
  const timeValid=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reviewTime)&&reviewTime>'06:10'&&reviewTime<'08:00';
  return <><h2>{s.issueResolved?'Incident closed':'Manage loading bay incident'}</h2><p className="wp-description">Kollupitiya Central · 14 chilled crates · Demo incident time 06:10 LK · Fresh window closes 08:00</p>
    {s.issueResolved?<AlertBanner tone="success" title="Outcome confirmed">{s.issueNote} Delivery and receipt remain separate driver/store actions.</AlertBanner>:<>
      <AlertBanner tone="warning" title="Recommended first step">Contact the driver and store manager to confirm an approved alternative unloading point. A smaller vehicle does not automatically solve a blocked loading bay.</AlertBanner>
      {s.issueStatus==='open'?<div className="wp-demo-row"><Button onClick={()=>dispatch({type:'ack'})}>Acknowledge incident</Button></div>:<>
        <div className="dp-form-stack"><SelectField label="Dispatcher response" value={action} onChange={e=>{setAction(e.target.value as Instruction['action']);setCoordinated(false);}}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</SelectField><p className="dp-inset">{guidance[action]}</p><TextField label="Review / follow-up time (LK)" type="time" min="06:11" max="07:59" value={reviewTime} onChange={e=>setReviewTime(e.target.value)} error={!timeValid?'Choose a review time after 06:10 and before 08:00.':undefined}/>
          <label className="dp-note-label" htmlFor="dispatch-instruction">Agreed instructions</label><textarea id="dispatch-instruction" className="dp-textarea" rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Record the agreed location or action, contact confirmation and any constraints…"/>
          <label className="dp-checkbox"><input type="checkbox" checked={coordinated} onChange={e=>setCoordinated(e.target.checked)}/>Driver/outlet coordination and relevant access, chilled handling and delivery-window checks completed</label>
          <Button disabled={!timeValid||!coordinated||note.trim().length<10} onClick={()=>{dispatch({type:'instruct',instruction:{action,note,reviewTime},coordinated});setNote('');setCoordinated(false);}}>Record {s.instruction?'updated ':''}instructions</Button>
        </div>
        {s.instruction&&<div className="dp-form-stack"><AlertBanner title="Awaiting confirmed outcome">{labels[s.instruction.action]} · Review at {s.instruction.reviewTime} LK. Instructions are recorded locally; no message has been sent.</AlertBanner><p className="dp-inset">{s.instruction.note}</p><TextField label="Confirmed outcome" value={outcome} onChange={e=>setOutcome(e.target.value)} hint="Describe what the driver/outlet confirmed. Do not mark delivered on their behalf."/><label className="dp-checkbox"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>Driver or outlet confirmed the outcome; this incident needs no further action</label><Button disabled={!verified||outcome.trim().length<10} onClick={()=>setConfirm(true)}>Close incident</Button></div>}
      </>}
    </>}
    <Modal open={confirm} onClose={()=>setConfirm(false)} title="Close this incident?" description="This closes the dispatch incident only. It does not mark the order delivered or confirm receipt." footer={<><Button variant="secondary" onClick={()=>setConfirm(false)}>Cancel</Button><Button onClick={()=>{dispatch({type:'resolve',note:outcome,confirmed:verified});setConfirm(false);}}>Confirm outcome</Button></>}><p>{outcome}</p></Modal>
  </>;
}
