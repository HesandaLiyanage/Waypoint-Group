import { useState, type Dispatch } from 'react';
import { AlertBanner, Button, Modal, SelectField, TextField } from '../../../components/common';
import type { Action, Instruction, IssueRow } from '../model';
const labels:Record<Instruction['action'],string>={alternate:'Agree an alternative unloading point',wait:'Hold briefly and reassess',reattempt:'Request a validated reattempt / route change',return:'Return affected goods and arrange next run'};
const guidance:Record<Instruction['action'],string>={
  alternate:'First check with the outlet whether another approved unloading point is available. Confirm vehicle access, safe unloading and chilled handling. Keep the driver safely stopped while coordinating.',
  wait:'Use a short, agreed review time while refrigeration is maintained. If access is still blocked, reassess before the outlet window closes. Do not wait indefinitely.',
  reattempt:'Request a revised sequence only after checking remaining outlet windows, travel time, fuel and load access. A loaded vehicle cannot be freely rearranged. Keep this pending until a feasible revision is confirmed.',
  return:'If no feasible unloading or reattempt is available, coordinate return of the affected goods and review the next operating run with the store. Do not record delivery or receipt; the driver records the actual outcome.',
};
export function IssueActions({issue,dispatch}:{issue:IssueRow;dispatch:Dispatch<Action>}) {
  const resolved=issue.status==='resolved',awaiting=issue.status==='ack'&&!!issue.instruction;
  const [action,setAction]=useState<Instruction['action']>('alternate'),[note,setNote]=useState(''),[reviewTime,setReviewTime]=useState('06:25'),[coordinated,setCoordinated]=useState(false),[outcome,setOutcome]=useState(''),[verified,setVerified]=useState(false),[confirm,setConfirm]=useState(false);
  const timeValid=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reviewTime)&&reviewTime<'23:59';
  return <><h2>{resolved?'Incident closed':`Manage incident · ${issue.kind.replaceAll('_',' ')}`}</h2><p className="wp-description">Raised by the {issue.raisedRole}. {issue.note}</p>
    {resolved?<AlertBanner tone="success" title="Outcome confirmed">{issue.outcome} Delivery and receipt remain separate driver/store actions.</AlertBanner>:<>
      <AlertBanner tone="warning" title="Recommended first step">Contact the driver and store manager to confirm an approved alternative unloading point. A smaller vehicle does not automatically solve a blocked loading bay.</AlertBanner>
      {issue.status==='open'?<div className="wp-demo-row"><Button onClick={()=>dispatch({type:'ack',issueId:issue.id})}>Acknowledge incident</Button></div>:<>
        <div className="dp-form-stack"><SelectField label="Dispatcher response" value={action} onChange={e=>{setAction(e.target.value as Instruction['action']);setCoordinated(false);}}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</SelectField><p className="dp-inset">{guidance[action]}</p><TextField label="Review / follow-up time (LK)" type="time" value={reviewTime} onChange={e=>setReviewTime(e.target.value)} error={!timeValid?'Choose a valid review time.':undefined}/>
          <label className="dp-note-label" htmlFor="dispatch-instruction">Agreed instructions</label><textarea id="dispatch-instruction" className="dp-textarea" rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Record the agreed location or action, contact confirmation and any constraints…"/>
          <label className="dp-checkbox"><input type="checkbox" checked={coordinated} onChange={e=>setCoordinated(e.target.checked)}/>Driver/outlet coordination and relevant access, chilled handling and delivery-window checks completed</label>
          <Button disabled={!timeValid||!coordinated||note.trim().length<10} onClick={()=>{dispatch({type:'instruct',issueId:issue.id,instruction:{action,note,reviewTime},coordinated});setNote('');setCoordinated(false);}}>Record {issue.instruction?'updated ':''}instructions</Button>
        </div>
        {awaiting&&issue.instruction&&<div className="dp-form-stack"><AlertBanner title="Awaiting confirmed outcome">Instructions recorded for the driver. Close the incident only once the driver or outlet confirms the outcome.</AlertBanner><p className="dp-inset">{issue.instruction.note}</p><TextField label="Confirmed outcome" value={outcome} onChange={e=>setOutcome(e.target.value)} hint="Describe what the driver/outlet confirmed. Do not mark delivered on their behalf."/><label className="dp-checkbox"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>Driver or outlet confirmed the outcome; this incident needs no further action</label><Button disabled={!verified||outcome.trim().length<10} onClick={()=>setConfirm(true)}>Close incident</Button></div>}
      </>}
    </>}
    <Modal open={confirm} onClose={()=>setConfirm(false)} title="Close this incident?" description="This closes the dispatch incident only. It does not mark the order delivered or confirm receipt." footer={<><Button variant="secondary" onClick={()=>setConfirm(false)}>Cancel</Button><Button onClick={()=>{dispatch({type:'resolve',issueId:issue.id,note:outcome,confirmed:verified});setConfirm(false);}}>Confirm outcome</Button></>}><p>{outcome}</p></Modal>
  </>;
}
