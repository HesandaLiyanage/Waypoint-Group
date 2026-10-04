import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSync } from '../context/SyncContext';
import { AppHeader } from './common';
import { storeActiveId, storeNavigation, useStoreRoute } from '../shells/store_manager/navigation';

// Connect the existing app contexts to the single shared header implementation.
export function ShellHeader() {
  const { currentUser, activeRole } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const storeRoute = useStoreRoute();
  const isStore = activeRole === 'store_manager';
  const { isOnline, isSyncing, pendingCount, triggerSync } = useSync();

  return <AppHeader
    activeId={isStore ? storeActiveId(storeRoute) : ''}
    navigationItems={isStore ? storeNavigation : []}
    locale={locale}
    onLocaleChange={setLocale}
    syncStatus={activeRole === 'driver' ? 'demo' : isSyncing ? 'syncing' : isOnline ? 'connected' : 'offline'}
    pendingCount={activeRole === 'driver' ? 0 : pendingCount}
    onSync={() => { void triggerSync(); }}
    account={{ name: currentUser.name, roleLabel: t(`roles.${activeRole}`, activeRole), detail: currentUser.email }}
  />;
}
