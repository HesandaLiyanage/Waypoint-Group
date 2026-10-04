import React from 'react';
import { I18nProvider } from './context/I18nContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { AppFooter } from './components/common';
import { ShellHeader } from './components/ShellHeader';
import { AuthRouter } from './components/AuthPages';
import { DispatcherShell } from './shells/dispatcher/DispatcherShell';
import { DriverShell } from './shells/driver/DriverShell';
import { LoaderShell } from './shells/loader/LoaderShell';
import { StoreShell } from './shells/store_manager/StoreShell';

const RoleRouter: React.FC = () => {
  const { activeRole } = useAuth();
  if (!activeRole) return <AuthRouter />;

  // Exactly the four roles in the challenge; the role is the one the server returned at sign-in.
  if (activeRole === 'dispatcher') return <SyncProvider><DispatcherShell /></SyncProvider>;

  const shell = activeRole === 'driver' ? <DriverShell /> : activeRole === 'loader' ? <LoaderShell /> : <StoreShell />;
  return (
    <SyncProvider>
      <div className="app-container">
        <a className="wp-skip-link" href="#main-content">Skip to content</a>
        <ShellHeader />
        <main id="main-content" className="shell-main" tabIndex={-1}>{shell}</main>
        <AppFooter />
      </div>
    </SyncProvider>
  );
};

export const App: React.FC = () => (
  <I18nProvider>
    <AuthProvider>
      <RoleRouter />
    </AuthProvider>
  </I18nProvider>
);

export default App;
