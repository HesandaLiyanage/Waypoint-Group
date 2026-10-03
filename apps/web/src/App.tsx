import React from 'react';
import { I18nProvider } from './context/I18nContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { AppFooter } from './components/common';
import { ShellHeader } from './components/ShellHeader';
import { AdminShell } from './shells/admin/AdminShell';
import { DispatcherShell } from './shells/dispatcher/DispatcherShell';
import { FieldAgentShell } from './shells/field/FieldAgentShell';
import { DriverShell } from './shells/driver/DriverShell';

const RoleRouter: React.FC = () => {
  const { activeRole } = useAuth();

  // Dispatcher frontend is independent of the legacy waypoint sync provider.
  if (activeRole === 'dispatcher') return <DispatcherShell />;

  const renderShell = () => {
    switch (activeRole) {
      case 'admin':
        return <AdminShell />;
      case 'field_agent':
        return <FieldAgentShell />;
      case 'driver':
        return <DriverShell />;
      default:
        return <AdminShell />;
    }
  };

  return (
    <SyncProvider><div className="app-container">
      <a className="wp-skip-link" href="#main-content">Skip to content</a>
      <ShellHeader />
      <main id="main-content" className="shell-main" tabIndex={-1}>{renderShell()}</main>
      <AppFooter />
    </div></SyncProvider>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <AuthProvider>
        <RoleRouter />
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;
