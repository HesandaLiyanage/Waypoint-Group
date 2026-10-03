import { useMemo, useState } from 'react';
import { AlertBanner, Badge, Button } from '../../components/common';
import { Icon } from './icons';

// Designed by us (not in the Figma set). Mock data. TODO: connect to a stock-count endpoint.
interface Line { sku: string; name: string; zone: string; system: number; }
const lines: Line[] = [
  { sku: 'SKU-MK-0182', name: 'Organic Farm Fresh Whole Milk', zone: 'Cold Vault A', system: 24 },
  { sku: 'SKU-CD-0914', name: 'Highland Curd Clay Pots', zone: 'Cold Vault A', system: 12 },
  { sku: 'SKU-EG-4401', name: 'Grade A Farm Eggs', zone: 'Ambient Rack 2', system: 18 },
  { sku: 'SKU-VEG-8802', name: 'Hydroponic Salad Greens', zone: 'Cold Vault B', system: 9 },
];
interface Past { id: string; when: string; zone: string; result: 'matched' | 'variance'; note: string }
const past0: Past[] = [
  { id: 'AUD-0931', when: 'Yesterday, 4:20 PM', zone: 'Cold Vault A', result: 'matched', note: '36 crates counted, no difference' },
  { id: 'AUD-0924', when: 'Mon, 3:55 PM', zone: 'Ambient Rack 2', result: 'variance', note: '1 crate short (Grade A Farm Eggs)' },
  { id: 'AUD-0917', when: 'Sun, 4:05 PM', zone: 'Cold Vault B', result: 'matched', note: '9 crates counted, no difference' },
];

export function StockAuditsScreen() {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [past, setPast] = useState<Past[]>(past0);
  const [done, setDone] = useState<{ id: string; diffs: number } | null>(null);

  const filled = lines.every((l) => counts[l.sku] !== undefined && counts[l.sku] !== '');
  const diff = (l: Line) => (counts[l.sku] === undefined || counts[l.sku] === '' ? null : Number(counts[l.sku]) - l.system);
  const diffs = useMemo(() => lines.filter((l) => { const d = diff(l); return d !== null && d !== 0; }).length, [counts]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const id = `AUD-${940 + past.length}`;
    setPast((p) => [{ id, when: 'Just now', zone: 'All zones', result: diffs ? 'variance' : 'matched', note: diffs ? `${diffs} item${diffs > 1 ? 's' : ''} with a difference` : `${lines.reduce((a, l) => a + l.system, 0)} crates counted, no difference` }, ...p]);
    setDone({ id, diffs }); setCounts({});
  };

  return (
    <div className="sm-page">
      <div className="sm-heading sm-heading--tight">
        <div><p className="sm-eyebrow sm-eyebrow--accent">Waypoint Fresh stock control • Store receiving manifest</p><h1 className="sm-h1-md">Stock Audits</h1></div>
        <div className="sm-location sm-location--ok">Active location: OUT047 — Waypoint Fresh</div>
      </div>

      {done ? (
        <AlertBanner tone={done.diffs ? 'warning' : 'success'} title={done.diffs ? `Audit ${done.id} submitted with ${done.diffs} difference${done.diffs > 1 ? 's' : ''}. Dispatch was told.` : `Audit ${done.id} submitted. Stock matches the system.`} action={<button type="button" className="sm-link" onClick={() => setDone(null)}>Start a new count</button>} />
      ) : (
        <AlertBanner tone="info" title="Daily cycle count is open. Please finish it before the 4:00 PM order cutoff." action={<span className="sm-pill">{lines.length} items to count</span>} />
      )}

      <div className="sm-split sm-split--wide">
        <section className="sm-list">
          <div className="sm-list-head"><p className="sm-eyebrow">Audit history</p><span>Last 7 days</span></div>
          <ul>
            {past.map((a) => (
              <li key={a.id} className="sm-cons">
                <span className="sm-cons-top"><strong>{a.id}</strong><span className="sm-spacer" /><Badge tone={a.result === 'matched' ? 'success' : 'warning'}>{a.result === 'matched' ? 'Matched' : 'Variance'}</Badge></span>
                <span className="sm-cons-line"><Icon name="clock" size={16} /> {a.when} · {a.zone}</span>
                <span className="sm-cons-line sm-cons-sub">{a.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="sm-detail">
          <div className="sm-detail-head">
            <div><h2>Daily cycle count <Badge tone="info">In progress</Badge></h2><p className="sm-muted">Count the crates on the shelves and type the number. The difference shows right away.</p></div>
            <Button variant="secondary" onClick={() => window.print()}><Icon name="print" /> Print count sheet</Button>
          </div>
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead><tr><th>Product & SKU</th><th>Zone</th><th>System (crates)</th><th>Counted</th><th>Difference</th></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const d = diff(l);
                  return (
                    <tr key={l.sku}>
                      <td><strong>{l.name}</strong><small>{l.sku}</small></td>
                      <td>{l.zone}</td>
                      <td><strong>{l.system}</strong></td>
                      <td><input className="sm-count" inputMode="numeric" aria-label={`Counted crates for ${l.name}`} value={counts[l.sku] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [l.sku]: e.target.value.replace(/\D/g, '').slice(0, 3) }))} placeholder="0" /></td>
                      <td>{d === null ? <span className="sm-muted">—</span> : d === 0 ? <Badge tone="success">✓ Match</Badge> : <Badge tone="danger">{d > 0 ? `+${d}` : d} crates</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sm-actions sm-actions--between">
            <span className="sm-muted">{filled ? (diffs ? `${diffs} difference${diffs > 1 ? 's' : ''} will be reported to dispatch.` : 'Everything matches.') : 'Fill in every count to submit.'}</span>
            <Button disabled={!filled} onClick={submit}><Icon name="checkc" /> Submit audit</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
