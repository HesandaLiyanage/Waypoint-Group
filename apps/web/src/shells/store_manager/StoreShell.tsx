import { useState } from 'react';
import { AuditsScreen, TelemetryScreen } from './AuditsScreen';
import { ReceivedScreen } from './ReceivedScreen';
import { ConfirmedScreen } from './ConfirmedScreen';
import { ReceiptScreen } from './ReceiptScreen';
import { ReportScreen } from './ReportScreen';
import { issueLabel, nowColombo, type IssueType, type ReceiptResult } from './receiptTypes';
import { DeferralScreen } from './DeferralScreen';
import { HomeScreen } from './HomeScreen';
import { InboundScreen } from './InboundScreen';
import { NewOrderScreen } from './NewOrderScreen';
import { TrackScreen } from './TrackScreen';
import { go, useStoreRoute } from './navigation';
import { type Notice } from './storeData';
import { useStoreData, type LiveConsignment } from './live';
import { AlertBanner, Button, EmptyState } from '../../components/common';
import { request } from '../../api/http';
import { useSync } from '../../context/SyncContext';
import './sm.css';

export function StoreShell() {
  const route = useStoreRoute();
  const { items, ready } = useStoreData();
  const { workspace, workspaceError, send, refresh } = useSync();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [escalated, setEscalated] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!items.length) return <div className="sm-root"><div className="sm-page">{workspaceError ? <AlertBanner tone="danger" title="Could not load your orders">{workspaceError}</AlertBanner> : route === 'new-order' ? <NewOrderScreen onSubmitted={() => { void refresh(); }} /> : <EmptyState title={ready ? 'No orders yet' : 'Loading your orders'} description={ready ? 'Place an order before the 16:00 cutoff and it appears here.' : 'Fetching your orders.'} action={ready ? <Button onClick={() => go('new-order')}>Place an order</Button> : undefined} />}</div></div>;

  // Prefer the order that is on its way or just delivered; the manager can pick another from the list.
  const target: LiveConsignment = items.find((c) => c.id === selectedId) ?? items.find((c) => c.stopStatus === 'arrived') ?? items.find((c) => c.stopStatus === 'delivered' || c.stopStatus === 'delivered_short') ?? items.find((c) => c.status === 'in_transit') ?? items[0];

  async function command(body: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      await request('/workflow/commands', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), plan_version: target.planVersion, ...body }) });
      await refresh();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); return false; } finally { setBusy(false); }
  }
  void send;
  const issueCode = () => { if (target.stopId) void command({ action: 'receipt_code', stop_id: target.stopId }); };
  const finish = async (kind: 'ok' | 'issue', issue?: IssueType) => {
    if (!target.stopId) return;
    const ok = await command({ action: 'receipt_confirm', stop_id: target.stopId, status: kind === 'ok' ? 'confirmed' : 'disputed', note: kind === 'ok' ? '' : `${issueLabel[issue ?? 'damaged']} reported by the store` });
    if (!ok) return;
    const at = nowColombo();
    setNotices((n) => [{ id: `r-${Date.now()}`, icon: kind === 'ok' ? 'check' : 'alert', title: kind === 'ok' ? `Receipt confirmed for ${target.id}` : `Issue reported for ${target.id}`, body: kind === 'ok' ? 'You confirmed the delivery matches what arrived.' : 'Dispatch was alerted.', ago: 'just now', unread: true }, ...n]);
    setReceipt({ orderId: target.id, at, kind, issue });
    go(kind === 'ok' ? 'confirmed' : 'reported');
  };

  const open = () => go('receipt');
  return (
    <div className="sm-root">
      {route === 'home' && <HomeScreen notices={notices} items={items} />}
      {route === 'new-order' && <NewOrderScreen onSubmitted={(ref, name, qty, late) => { setNotices((n) => [{ id: ref, icon: 'snow', title: `Order ${ref} submitted`, body: `${qty} units of ${name}${late ? ' — joins the following run (after 4 PM cutoff)' : ' — planned at the 4 PM cutoff'}.`, ago: 'just now', unread: true }, ...n]); void refresh(); }} />}
      {route === 'inbound' && <InboundScreen items={items} selectedId={selectedId} onSelect={setSelectedId} onConfirmReceipt={open} />}
      {route === 'deferral' && <DeferralScreen items={items} escalated={escalated} onEscalate={() => { setEscalated(true); setNotices((n) => [{ id: `e-${Date.now()}`, icon: 'bolt', title: 'Escalation noted on this screen only', body: 'Contact dispatch directly: escalation is not sent to the server yet.', ago: 'just now', unread: true }, ...n]); }} onSelect={setSelectedId} />}
      {route === 'track' && <TrackScreen c={target} onConfirmReceipt={open} />}
      {route === 'receipt' && <ReceiptScreen c={target} busy={busy} error={error} onIssueCode={issueCode} onConfirm={() => void finish('ok')} />}
      {route === 'report' && <ReportScreen c={target} onSubmit={(t) => void finish('issue', t)} />}
      {(route === 'confirmed' || route === 'reported') && <ConfirmedScreen r={receipt} />}
      {route === 'audits' && <AuditsScreen />}
      {route === 'telemetry' && <TelemetryScreen />}
      {route === 'received' && <ReceivedScreen r={receipt} />}
    </div>
  );
}
