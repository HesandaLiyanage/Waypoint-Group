import { useEffect, useState } from 'react';
import { AlertBanner, AppLayout, Button, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import { useSync } from '../../context/SyncContext';
import { useLiveDispatch } from './live';
import { Home } from './pages/Home';
import { OrderQueue } from './pages/OrderQueue';
import { Allocation, Confirmation, Deferrals } from './pages/Planning';
import { Tracking, TripDetail } from './pages/Tracking';
import { Capacity } from './pages/Capacity';
import { PageLink } from './shared';
import './dispatcher.css';

export function DispatcherShell() {
  const {locale,setLocale}=useI18n();
  const {currentUser,logout}=useAuth();
  const {isOnline,isSyncing,pendingCount,triggerSync}=useSync();
  const {state,dispatch,busy,error,clearError,loadError}=useLiveDispatch();
  const [hash,setHash]=useState(window.location.hash);
  useEffect(()=>{const change=()=>{setHash(window.location.hash);window.scrollTo({top:0});};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  const [pathname,query='']=hash.replace(/^#\/?dispatcher\/?/,'').split('?');
  const [page='home',id]=pathname.split('/');const current=page||'home';
  const active=current==='trip'?'tracking':['confirmed','summary'].includes(current)?'allocation':current==='deferrals-recorded'?'deferrals':current;
  useEffect(()=>{document.title=`${current.replaceAll('-',' ')} · Waypoint`;document.getElementById('main-content')?.focus({preventScroll:true});},[current,id]);
  let content;
  if(!state)content=loadError?<AlertBanner tone="danger" title="Could not load the dispatch workspace" action={<Button variant="secondary" onClick={()=>{void triggerSync();}}>Retry</Button>}>{loadError}</AlertBanner>:<EmptyState title="Loading dispatch workspace" description="Fetching orders, vehicles and plans."/>;
  else switch(current) {
    case 'home':content=<Home state={state} dispatch={dispatch}/>;break;
    case 'orders':content=<OrderQueue state={state} dispatch={dispatch} priorityOnly={new URLSearchParams(query).has('priority')}/>;break;
    case 'allocation':content=<Allocation state={state} dispatch={dispatch}/>;break;
    case 'summary':content=state.confirmed?<Allocation state={state} dispatch={dispatch} summary/>:<EmptyState title="No published plan yet" description="Complete the allocation review to create a read-only summary." action={<PageLink to="allocation">Review plan</PageLink>}/>;break;
    case 'deferrals':content=<Deferrals state={state} dispatch={dispatch}/>;break;
    case 'deferrals-recorded':content=<Confirmation state={state} kind="deferrals"/>;break;
    case 'confirmed':content=<Confirmation state={state} kind="plan"/>;break;
    case 'tracking':content=<Tracking state={state}/>;break;
    case 'trip':content=<TripDetail key={id} id={id??''} state={state} dispatch={dispatch}/>;break;
    case 'capacity':content=<Capacity state={state} dispatch={dispatch}/>;break;
    default:content=<EmptyState title="Page not found" description="Choose a dispatcher page from the navigation." action={<PageLink to="home">Go to home</PageLink>}/>;
  }
  const depot=currentUser?.depot??'';
  return <AppLayout role="dispatcher" activeId={active} locale={locale} onLocaleChange={setLocale} syncStatus={busy||isSyncing?'syncing':isOnline?'connected':'offline'} pendingCount={pendingCount} onSync={()=>{void triggerSync();}} account={{name:currentUser?.name??'Dispatcher',roleLabel:'Dispatcher',detail:currentUser?.email}} onSignOut={()=>{void logout();}} depotLabel={depot}>
    {error&&<AlertBanner tone="danger" title="Action not completed" action={<Button variant="secondary" onClick={clearError}>Dismiss</Button>}>{error}</AlertBanner>}
    {content}
  </AppLayout>;
}
