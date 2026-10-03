import { useRef, useState } from 'react';
import { Badge, Button, Card } from '../../components/common';
import { ManifestSide } from './ManifestSide';
import { Icon } from './icons';
import { go } from './navigation';
import type { Consignment } from './storeData';

export const DEMO_CODE = '4829';

export function ReceiptScreen({ c, onConfirm }: { c: Consignment; onConfirm: () => void }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [resent, setResent] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join('');
  const full = code.length === 4;
  const wrong = full && code !== DEMO_CODE;
  const ready = full && !wrong;

  const set = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    setDigits((x) => x.map((y, j) => (j === i ? d : y)));
    if (d && i < 3) refs.current[i + 1]?.focus();
  };
  const key = (i: number, e: React.KeyboardEvent) => { if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus(); };
  const paste = (e: React.ClipboardEvent) => { const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4); if (t) { e.preventDefault(); setDigits([0, 1, 2, 3].map((i) => t[i] ?? '')); } };

  return (
    <div className="sm-page">
      <div className="sm-split sm-split--form">
        <Card className="sm-form">
          <div className="sm-form-head"><h1 className="sm-h1-md">Receipt Confirmation</h1><Badge tone="success">BAY 2</Badge></div>
          <p className="sm-muted">An SMS with your code was sent to your registered number, or ask the driver to read the code on their screen.</p>
          <div className="sm-otp" onPaste={paste}>
            <div className="sm-otp-boxes" role="group" aria-label="4 digit receipt code">
              {digits.map((d, i) => (
                <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" autoComplete="one-time-code" maxLength={1} aria-label={`Digit ${i + 1}`} aria-invalid={wrong} onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => key(i, e)} />
              ))}
            </div>
            {wrong && <p className="sm-error" role="alert">That code does not match. Check with the driver.</p>}
            <button type="button" className="sm-link" onClick={() => setResent(true)}>{resent ? 'Code resent' : 'Resend code'}</button>
            <small className="sm-hint">Demo code: {DEMO_CODE}</small>
          </div>
          <div className="sm-two-btn">
            <Button className="sm-btn-ok" disabled={!ready} onClick={onConfirm}><Icon name="checkc" /> Everything arrived as ordered</Button>
            <Button className="sm-btn-bad" disabled={!ready} onClick={() => go('report')}><Icon name="alert" /> Report an issue</Button>
          </div>
        </Card>
        <ManifestSide c={c} extra="driver" />
      </div>
    </div>
  );
}
