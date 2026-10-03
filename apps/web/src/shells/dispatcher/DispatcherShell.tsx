import { useEffect, useReducer, useState } from 'react';
import { AppLayout, Button, EmptyState, Modal } from '../../components/common';
import { useI18n } from '../../context/I18nContext';
import { initialState, reducer } from './model';
import { Home } from './pages/Home';
import { OrderQueue } from './pages/OrderQueue';
import { Allocation, Confirmation, Deferrals } from './pages/Planning';
import { Tracking, TripDetail } from './pages/Tracking';
import { Capacity } from './pages/Capacity';
import { PageLink } from './shared';
import './dispatcher.css';

export function DispatcherShell() {
  const {locale,setLocale}=useI18n();
  const [state,dispatch]=useReducer(reducer,undefined,initialState);
  const [hash,setHash]=useState(window.location.hash),[reset,setReset]=useState(false);
  useEffect(()=>{const change=()=>{setHash(window.location.hash);window.scrollTo({top:0});};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  const [pathname,query='']=hash.replace(/^#\/?dispatcher\/?/,'').split('?');
  const [page='home',id]=pathname.split('/');const current=page||'home';
  const active=current==='trip'?'tracking':['confirmed','summary'].includes(current)?'allocation':current==='deferrals-recorded'?'deferrals':current;
  useEffect(()=>{document.title=`${current.replaceAll('-',' ')} · Waypoint Fresh`;document.getElementById('main-content')?.focus({preventScroll:true});},[current,id]);
  let content;
  switch(current) {
    case 'home':content=<Home state={state}/>;break;
    case 'orders':content=<OrderQueue state={state} dispatch={dispatch} priorityOnly={new URLSearchParams(query).has('priority')}/>;break;
    case 'allocation':content=<Allocation state={state} dispatch={dispatch}/>;break;
    case 'summary':content=state.confirmed?<Allocation state={state} dispatch={dispatch} summary/>:<EmptyState title="No confirmed plan yet" description="Complete the allocation review to create a read-only summary." action={<PageLink to="allocation">Review plan</PageLink>}/>;break;
    case 'deferrals':content=<Deferrals state={state} dispatch={dispatch}/>;break;
    case 'deferrals-recorded':content=<Confirmation state={state} kind="deferrals"/>;break;
    case 'confirmed':content=<Confirmation state={state} kind="plan"/>;break;
    case 'tracking':content=<Tracking state={state}/>;break;
    case 'trip':content=<TripDetail key={id} id={id??''} state={state} dispatch={dispatch}/>;break;
    case 'capacity':content=<Capacity state={state} dispatch={dispatch}/>;break;
    default:content=<EmptyState title="Page not found" description="Choose a dispatcher page from the navigation." action={<PageLink to="home">Go to home</PageLink>}/>;
  }
  return <AppLayout role="dispatcher" activeId={active} locale={locale} onLocaleChange={setLocale} syncStatus="idle" account={{name:'Dispatch Desk',roleLabel:'Dispatcher · Demo',detail:'Peliyagoda · DC-01'}} depotLabel="Peliyagoda · DC-01">
    <div className="dp-demo"><span><strong>Frontend demo</strong> · Sample data only. Changes reset on reload; no backend actions are sent.</span><Button variant="ghost" onClick={()=>setReset(true)}>Reset demo</Button></div>
    {content}
    <Modal open={reset} onClose={()=>setReset(false)} title="Reset this demo?" description="Queue priorities, assignments, deferral reasons and incident notes will return to their sample values." footer={<><Button variant="secondary" onClick={()=>setReset(false)}>Cancel</Button><Button onClick={()=>{dispatch({type:'reset'});setReset(false);window.location.hash='#/dispatcher/home';}}>Reset demo</Button></>}><p>This only affects the frontend demonstration.</p></Modal>
  </AppLayout>;
}
