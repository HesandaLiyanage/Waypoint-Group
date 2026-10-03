import { useState } from 'react';
import { AuditsScreen, TelemetryScreen } from './AuditsScreen';
import { ReceivedScreen } from './ReceivedScreen';
import { ConfirmedScreen } from './ConfirmedScreen';
import { ReceiptScreen } from './ReceiptScreen';
import { ReportScreen } from './ReportScreen';
import { nowColombo, type IssueType, type ReceiptResult } from './receiptTypes';
import { DeferralScreen } from './DeferralScreen';
import { HomeScreen } from './HomeScreen';
import { InboundScreen } from './InboundScreen';
import { NewOrderScreen } from './NewOrderScreen';
import { TrackScreen } from './TrackScreen';
import { go, useStoreRoute } from './navigation';
import { consignments, notificationsSeed, type Consignment, type Notice } from './storeData';
import './sm.css';

export function StoreShell() {
  const route = useStoreRoute();
  const [items, setItems] = useState<Consignment[]>(consignments);
  const [notices, setNotices] = useState<Notice[]>(notificationsSeed);
  const [selectedId, setSelectedId] = useState(items[0].id);
  const [escalated, setEscalated] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null);

  const transit = items.find((c) => c.status === 'in_transit') ?? items[0];
  const target = items.find((c) => c.id === selectedId && c.status === 'in_transit') ?? transit;

  const finish = (kind: 'ok' | 'issue', issue?: IssueType) => {
    const at = nowColombo();
    setItems((xs) => xs.map((c) => (c.id === target.id ? { ...c, status: 'delivered', window: `Delivered today at ${at}`, eta: undefined } : c)));
    setNotices((n) => [{ id: `r-${Date.now()}`, icon: kind === 'ok' ? 'check' : 'alert', title: kind === 'ok' ? `Receipt confirmed for ${target.id}` : `Issue reported for ${target.id}`, body: kind === 'ok' ? 'All items received as ordered.' : 'Dispatch was alerted and the driver will countersign.', ago: 'just now', unread: true }, ...n]);
    setReceipt({ orderId: target.id, at, kind, issue });
    go(kind === 'ok' ? 'confirmed' : 'reported');
  };

  const open = () => go('receipt');
  return (
    <div className="sm-root">
      {route === 'home' && <HomeScreen notices={notices} dryStatus="confirmed" />}
      {route === 'new-order' && <NewOrderScreen onSubmitted={(ref, name, qty, late) => setNotices((n) => [{ id: ref, icon: 'snow', title: `Order ${ref} submitted`, body: `${qty} crates of ${name}${late ? ' — joins the following run (after 4 PM cutoff)' : ' — planned at the 4 PM cutoff'}.`, ago: 'just now', unread: true }, ...n])} />}
      {route === 'inbound' && <InboundScreen items={items} selectedId={selectedId} onSelect={setSelectedId} onConfirmReceipt={open} />}
      {route === 'deferral' && <DeferralScreen items={items} escalated={escalated} onEscalate={() => { setEscalated(true); setNotices((n) => [{ id: `e-${Date.now()}`, icon: 'bolt', title: 'Priority escalation requested', body: 'The Peliyagoda desk was notified about the deferred order.', ago: 'just now', unread: true }, ...n]); }} onSelect={setSelectedId} />}
      {route === 'track' && <TrackScreen c={target} onConfirmReceipt={open} />}
      {route === 'receipt' && <ReceiptScreen c={target} onConfirm={() => finish('ok')} />}
      {route === 'report' && <ReportScreen c={target} onSubmit={(t) => finish('issue', t)} />}
      {(route === 'confirmed' || route === 'reported') && <ConfirmedScreen r={receipt} />}
      {route === 'audits' && <AuditsScreen />}
      {route === 'telemetry' && <TelemetryScreen />}
      {route === 'received' && <ReceivedScreen r={receipt} />}
    </div>
  );
}
