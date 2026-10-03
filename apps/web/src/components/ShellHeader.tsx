import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSync } from '../context/SyncContext';
import { AppHeader } from './common';

// Connect the existing app contexts to the single shared header implementation.
export function ShellHeader() {
  const { currentUser, activeRole } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { isOnline, isSyncing, pendingCount, triggerSync } = useSync();

  return <AppHeader
    activeId=""
    navigationItems={[]}
    locale={locale}
    onLocaleChange={setLocale}
    syncStatus={isSyncing ? 'syncing' : isOnline ? 'connected' : 'offline'}
    pendingCount={pendingCount}
    onSync={() => { void triggerSync(); }}
    account={{ name: currentUser.name, roleLabel: t(`roles.${activeRole}`, activeRole), detail: currentUser.email }}
  />;
}
