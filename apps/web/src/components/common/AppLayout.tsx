import { useEffect, useState, type ReactNode } from 'react';
import { LOCALES, type Locale } from '@waypoint/i18n';
import { formatColomboTime } from '@waypoint/domain';
import { roleNavigation, type NavigationItem, type OperationalRole } from './navigation';

export type SyncStatus = 'connected' | 'syncing' | 'offline' | 'idle' | 'demo';
const syncLabels: Record<Locale, Record<SyncStatus, string>> = {
  en: { connected: 'Online', syncing: 'Syncing changes', offline: 'Offline', idle: 'Not connected', demo: 'Demo' },
  si: { connected: 'මාර්ගගතයි', syncing: 'සමමුහුර්ත වෙමින්', offline: 'නොබැඳියි', idle: 'සම්බන්ධ වී නැත', demo: 'Demo' },
  ta: { connected: 'இணையத்தில்', syncing: 'ஒத்திசைக்கிறது', offline: 'இணைப்பில்லை', idle: 'இணைக்கப்படவில்லை', demo: 'Demo' },
};
export function BrandLogo({ href = '#/dispatcher/home' }: { href?: string }) {
  return <a className="wp-brand" href={href} aria-label="Waypoint Fresh home"><img src="/assets/brand/waypoint-fresh.png" alt="Waypoint Fresh" width="372" height="80" /></a>;
}
export function LanguageSelector({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  return <div className="wp-language" role="group" aria-label="Select language">
    {Object.entries(LOCALES).map(([code, meta]) => <button
      key={code}
      type="button"
      lang={code}
      aria-pressed={locale === code}
      onClick={() => onChange(code as Locale)}
    >{meta.nativeName}</button>)}
  </div>;
}
export function ColomboClock() {
  const [time, setTime] = useState(() => formatColomboTime());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(formatColomboTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="wp-clock" title="Sri Lanka Standard Time (Asia/Colombo, UTC+05:30)">{time} <small>LK</small></span>;
}
export function SyncIndicator({ status, locale = 'en', pendingCount = 0 }: { status: SyncStatus; locale?: Locale; pendingCount?: number }) {
  return <span className={`wp-sync wp-sync--${status}`} role="status"><span className="wp-status-dot" aria-hidden="true" />{syncLabels[locale][status]}{pendingCount > 0 && <span className="wp-sync-count">{pendingCount}</span>}</span>;
}
export function RoleNavigation({ role, activeId, locale, items = roleNavigation[role], onNavigate }: {
  role: OperationalRole; activeId: string; locale: Locale; items?: NavigationItem[]; onNavigate?: () => void;
}) {
  return <nav className={`wp-navigation wp-navigation--${role}`} aria-label="Primary navigation">
    {items.map(item => <a key={item.id} href={item.href} aria-current={activeId === item.id ? 'page' : undefined} onClick={onNavigate}>{item.label[locale]}</a>)}
  </nav>;
}
export interface AppLayoutProps {
  role?: OperationalRole; activeId: string; locale: Locale; onLocaleChange: (locale: Locale) => void;
  syncStatus: SyncStatus; pendingCount?: number; onSync?: () => void; navigationItems?: NavigationItem[];
  account: { name: string; roleLabel: string; detail?: string }; depotLabel?: string; children: ReactNode;
}
export function AppHeader({ role, activeId, locale, onLocaleChange, syncStatus, pendingCount = 0, onSync, navigationItems, account }: Omit<AppLayoutProps, 'children'>) {
  const items = navigationItems ?? (role ? roleNavigation[role] : []);
  const navigationRole = role ?? 'dispatcher';
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); setAccountOpen(false); }, [activeId, role]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); setAccountOpen(false); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  return <header className="wp-header"><div className="wp-header-inner">
    <BrandLogo href={items[0]?.href ?? '/'} />
    {items.length > 0 && <div className="wp-desktop-nav"><RoleNavigation role={navigationRole} activeId={activeId} locale={locale} items={items} /></div>}
    <div className="wp-header-tools">
      <LanguageSelector locale={locale} onChange={onLocaleChange} />
      <ColomboClock />
      <div className="wp-sync-controls"><SyncIndicator status={syncStatus} locale={locale} />
        {pendingCount > 0 && (onSync ? <button type="button" className="wp-pending-sync" onClick={onSync} disabled={syncStatus === 'syncing' || syncStatus === 'offline'} title="Sync pending changes">↑ {pendingCount} queued</button> : <span className="wp-sync-count">{pendingCount} queued</span>)}
      </div>
      <div className="wp-account-wrap">
        <button type="button" className="wp-account" aria-label="Account details" aria-expanded={accountOpen} aria-controls="wp-account-panel" onClick={() => setAccountOpen(!accountOpen)}><img src="/assets/icons/account.svg" width="20" height="20" alt="" /></button>
        {accountOpen && <div id="wp-account-panel" className="wp-account-panel"><strong>{account.name}</strong><span>{account.roleLabel}</span>{account.detail && <small>{account.detail}</small>}</div>}
      </div>
    </div>
    {items.length > 0 && <><button type="button" className="wp-menu-toggle" aria-expanded={menuOpen} aria-controls="wp-mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? 'Close' : 'Menu'}<span aria-hidden="true">{menuOpen ? '×' : '☰'}</span></button>
    <div id="wp-mobile-navigation" className="wp-mobile-nav" hidden={!menuOpen}><RoleNavigation role={navigationRole} activeId={activeId} locale={locale} items={items} onNavigate={() => setMenuOpen(false)} /></div></>}
  </div></header>;
}
export function AppFooter({ depotLabel }: { depotLabel?: string }) {
  return <footer className="wp-footer"><div className="wp-footer-inner">
    <small>© {new Date().getFullYear()} Waypoint Fresh. All rights reserved.</small>
    {depotLabel && <span>{depotLabel}</span>}
  </div></footer>;
}
export function AppLayout({ children, ...props }: AppLayoutProps) {
  return <div className="wp-app" lang={props.locale}><a className="wp-skip-link" href="#main-content">Skip to content</a><AppHeader {...props} /><main id="main-content" className="wp-main" tabIndex={-1}>{children}</main><AppFooter depotLabel={props.depotLabel} /></div>;
}
