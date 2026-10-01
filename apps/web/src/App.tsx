import React from 'react';
import { I18nProvider } from './context/I18nContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { ShellHeader } from './components/ShellHeader';
import { AdminShell } from './shells/admin/AdminShell';
import { DispatcherShell } from './shells/dispatcher/DispatcherShell';
import { FieldAgentShell } from './shells/field/FieldAgentShell';
import { DriverShell } from './shells/driver/DriverShell';

const RoleRouter: React.FC = () => {
  const { activeRole } = useAuth();

  const renderShell = () => {
    switch (activeRole) {
      case 'admin':
        return <AdminShell />;
      case 'dispatcher':
        return <DispatcherShell />;
      case 'field_agent':
        return <FieldAgentShell />;
      case 'driver':
        return <DriverShell />;
      default:
        return <AdminShell />;
    }
  };

  return (
    <div className="app-container">
      <ShellHeader />
      <main className="shell-main">{renderShell()}</main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <AuthProvider>
        <SyncProvider>
          <RoleRouter />
        </SyncProvider>
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;
