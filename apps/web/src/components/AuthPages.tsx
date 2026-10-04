import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { getFacilities, register as apiRegister, type Facilities } from '../api/http';
import './auth.css';

type Page = 'landing' | 'login' | 'register';
const readPage = (): Page => (location.hash === '#/login' ? 'login' : location.hash === '#/register' ? 'register' : 'landing');
const go = (p: Page) => { location.hash = p === 'landing' ? '#/' : `#/${p}`; };

export function AuthRouter() {
  const [page, setPage] = useState<Page>(readPage);
  useEffect(() => { const f = () => setPage(readPage()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { document.title = `${page === 'landing' ? 'Waypoint Fresh' : page === 'login' ? 'Log in' : 'Register'} · Waypoint`; }, [page]);
  return page === 'login' ? <LoginPage /> : page === 'register' ? <RegisterPage /> : <LandingPage />;
}

// Outline eye icon (eye with a slash while the password is visible), drawn with currentColor so it follows the theme.
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return <a className={`au-brand ${light ? 'is-light' : ''}`} href="#/"><img src="/assets/brand/waypoint-fresh.png" alt="Waypoint Fresh" /></a>;
}
function Languages() {
  const { locale, setLocale } = useI18n();
  return <div className="au-lang" role="group" aria-label="Language">{([['en', 'English'], ['si', 'සිං'], ['ta', 'தமிழ்']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={locale === k} onClick={() => setLocale(k)}>{l}</button>)}</div>;
}

export function LandingPage() {
  const roles = [
    { icon: '🛒', name: 'Store Manager', text: 'Place orders, track deliveries, confirm receipts.', link: 'Store portal' },
    { icon: '📋', name: 'Dispatcher', text: 'Allocate routes, manage fleet, resolve issues.', link: 'Control console' },
    { icon: '📦', name: 'Loader', text: 'Load trips, flag shortages, mark vehicles ready.', link: 'Staging bays' },
    { icon: '🚚', name: 'Driver', text: 'Follow trips, flag issues, deliver on time.', link: 'Driver run-sheet' },
  ];
  return (
    <div className="au-page">
      <header className="au-top"><Brand /><Languages /></header>
      <main id="main-content" className="au-landing">
        <section className="au-hero">
          <div className="au-hero-copy">
            <span className="au-pill">COLD-CHAIN LOGISTICS PLATFORM</span>
            <h1>Supply chain precision, from depot to doorstep.</h1>
            <p>Waypoint connects store managers, dispatchers, loaders, and drivers on one platform, so every Fresh order reaches its outlet on time and in condition.</p>
            <div className="au-actions">
              <a className="au-btn au-btn--mint" href="#/login">Log in to your outlet</a>
              <a className="au-btn au-btn--ghost" href="#/register">Register your outlet</a>
            </div>
          </div>
          <div className="au-chain" aria-label="Order chain of custody">
            <div className="au-chain-head"><span>ORDER CHAIN OF CUSTODY</span><span className="au-live">● ONE SHARED WORKFLOW</span></div>
            <ol className="au-nodes">
              <li><span className="au-node">🏭</span><strong>Depot</strong><small>Peliyagoda · Kandy</small></li>
              <li className="au-link" aria-hidden="true" />
              <li><span className="au-node is-on">🚚</span><strong>Truck</strong><small>Loaded and sealed</small></li>
              <li className="au-link" aria-hidden="true" />
              <li><span className="au-node">🏬</span><strong>Outlet</strong><small>Receiving dock</small></li>
            </ol>
            <div className="au-chain-foot">Code-verified handover · Receipts recorded for every stop</div>
          </div>
        </section>
        <h2 className="au-h2">Built for every role in the chain.</h2>
        <div className="au-roles">
          {roles.map((r) => <a key={r.name} className="au-role" href="#/login"><span className="au-role-icon" aria-hidden="true">{r.icon}</span><h3>{r.name}</h3><p>{r.text}</p><span className="au-role-link">{r.link} →</span></a>)}
        </div>
      </main>
    </div>
  );
}

function Split({ children, title, text, light }: { children: ReactNode; title: string; text: string; light?: boolean }) {
  return (
    <div className="au-split">
      <aside className="au-side">
        <Brand light />
        <div className="au-side-copy">
          <span className="au-pill">{light ? 'INTERNAL OPERATIONS PORTAL' : 'Cold-Chain Precision Sync'}</span>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </aside>
      <main id="main-content" className="au-form-side"><div className="au-form-top"><Brand /><Languages /></div>{children}</main>
    </div>
  );
}

export function LoginPage() {
  const { login, loginOutlet, pinLogin } = useAuth();
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const value = id.trim();
    try {
      if (mode === 'pin') await pinLogin(value, secret);
      else if (value.includes('@')) await login(value, secret);
      else await loginOutlet(value.toUpperCase(), secret);
      location.hash = '';
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign in failed'); } finally { setBusy(false); }
  };
  return (
    <Split title="Intelligent logistics for every island outlet." text="Real-time order tracking, automated stock distribution, and dispatch intelligence across Sri Lanka's vital fresh supply lines.">
      <section className="au-card" aria-labelledby="login-title">
        <h1 id="login-title">Log in to your account.</h1>
        <p className="au-sub">{mode === 'pin' ? 'Enter the terminal account and your dock PIN.' : 'Enter your Outlet ID and password to continue.'}</p>
        <form onSubmit={submit} noValidate>
          <label className="au-field"><span>{mode === 'pin' ? 'Terminal account' : 'Outlet ID or work email'}</span>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder={mode === 'pin' ? 'Terminal account' : 'OUT047 or work email'} autoComplete="username" required />
</label>
          <label className="au-field"><span>{mode === 'pin' ? 'PIN' : 'Password'}</span>
            <span className="au-input-wrap"><input type={show ? 'text' : 'password'} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={mode === 'pin' ? 'Dock PIN' : 'Enter password'} autoComplete={mode === 'pin' ? 'one-time-code' : 'current-password'} inputMode={mode === 'pin' ? 'numeric' : undefined} required />
              <button type="button" className="au-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}><EyeIcon off={show} /></button></span></label>
          <div className="au-row"><button type="button" className="au-link-btn" onClick={() => { setMode(mode === 'pin' ? 'password' : 'pin'); setError(''); setSecret(''); }}>{mode === 'pin' ? 'Use password instead' : 'Dock terminal? Use PIN'}</button>
</div>
          <div className="au-info" role="note">ⓘ You will be directed to your role's home screen automatically after login: Store Manager, Dispatcher, Loader, or Driver.</div>
          {error && <div className="au-error" role="alert">{error}</div>}
          <button className="au-btn au-btn--dark au-btn--block" type="submit" disabled={busy || !id.trim() || !secret}>{busy ? 'Signing in…' : '⇥ Log in'}</button>
        </form>
        <p className="au-foot">Don't have an account? <a href="#/register">Register your outlet</a></p>
      </section>
    </Split>
  );
}

const ROLE_OPTIONS = [['store_manager', 'Store manager'], ['dispatcher', 'Dispatcher'], ['loader', 'Loader'], ['driver', 'Driver']] as const;

export function RegisterPage() {
  const [fac, setFac] = useState<Facilities | null>(null);
  const [facError, setFacError] = useState('');
  const [f, setF] = useState({ role: '', name: '', work_id: '', station: '', email: '', phone: '', password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { getFacilities().then(setFac).catch((e) => setFacError(e.message)); }, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === 'role' ? { station: '' } : {}) }));
  const stations = f.role === 'store_manager' ? (fac?.outlets ?? []).map((o) => ({ v: o.outlet_id, l: `${o.outlet_id} · ${o.brand} · ${o.district}` })) : (fac?.depots ?? []).map((d) => ({ v: d, l: `${d} depot` }));
  const mismatch = f.confirm.length > 0 && f.password !== f.confirm;
  const valid = f.role && f.name.trim() && f.work_id.trim() && f.station && f.email.includes('@') && f.password.length >= 8 && f.password === f.confirm;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError('');
    try { setDone((await apiRegister({ role: f.role, name: f.name, work_id: f.work_id, station: f.station, email: f.email, phone: f.phone, password: f.password })).detail); }
    catch (err) { setError(err instanceof Error ? err.message : 'Registration failed'); } finally { setBusy(false); }
  };
  return (
    <Split light title="Connecting every link in the fresh supply chain." text="Join the unified operational workforce managing fleet, replenishment fulfilment and outlet receiving across Sri Lanka.">
      <section className="au-card au-card--wide" aria-labelledby="reg-title">
        <p className="au-eyebrow">PERSONNEL ONBOARDING</p>
        <h1 id="reg-title">Create your user account</h1>
        <p className="au-sub">Join your assigned depot, fleet, or outlet operational network.</p>
        {done ? <div className="au-success" role="status"><strong>Request sent.</strong> {done}<p><a href="#/login">Back to log in</a></p></div> :
        <form onSubmit={submit} noValidate>
          {facError && <div className="au-error" role="alert">Could not load stations: {facError}</div>}
          <label className="au-field"><span>Operational role <em>REQUIRED</em></span><select value={f.role} onChange={set('role')} required><option value="">Select your role</option>{ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="au-field"><span>Full name</span><input value={f.name} onChange={set('name')} placeholder="e.g. Kasun Fernando" autoComplete="name" required /></label>
          <div className="au-two">
            <label className="au-field"><span>Employee ID / work ID</span><input value={f.work_id} onChange={set('work_id')} placeholder="e.g. EMP-7842" required /><small>Assigned by your regional depot coordinator.</small></label>
            <label className="au-field"><span>Assigned station</span><select value={f.station} onChange={set('station')} disabled={!f.role} required><option value="">{f.role ? 'Select facility' : 'Choose a role first'}</option>{stations.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select></label>
          </div>
          <label className="au-field"><span>Work email & mobile</span>
            <span className="au-two"><input type="email" value={f.email} onChange={set('email')} placeholder="e.g. kasun@waypoint.lk" autoComplete="email" required /><input type="tel" value={f.phone} onChange={set('phone')} placeholder="e.g. +94 77 123 4567" autoComplete="tel" /></span></label>
          <div className="au-two">
            <label className="au-field"><span>Password</span><span className="au-input-wrap"><input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete="new-password" required /><button type="button" className="au-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide passwords' : 'Show passwords'}><EyeIcon off={show} /></button></span></label>
            <label className="au-field"><span>Confirm password</span><input type={show ? 'text' : 'password'} value={f.confirm} onChange={set('confirm')} placeholder="Repeat password" autoComplete="new-password" aria-invalid={mismatch} required />{mismatch && <small className="au-bad">Passwords do not match.</small>}</label>
          </div>
          {error && <div className="au-error" role="alert">{error}</div>}
          <button className="au-btn au-btn--dark au-btn--block" type="submit" disabled={busy || !valid}>{busy ? 'Sending…' : 'Create User Account →'}</button>
          <p className="au-fine">Your account is activated after your depot coordinator approves the request.</p>
        </form>}
        <p className="au-foot">Already have an operational account? <a href="#/login">Log in</a></p>
      </section>
    </Split>
  );
}
