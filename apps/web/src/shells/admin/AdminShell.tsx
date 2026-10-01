import React from 'react';
import { useI18n } from '../../context/I18nContext';
import { useSync } from '../../context/SyncContext';
import { useAuth } from '../../context/AuthContext';
import { formatColomboDateTime, isColomboWorkingHours, getColomboShift } from '@waypoint/domain';

export const AdminShell: React.FC = () => {
  const { t } = useI18n();
  const { waypoints, pendingCount, lastSyncedAt } = useSync();
  const { currentUser } = useAuth();

  const isWorkHours = isColomboWorkingHours();
  const currentShift = getColomboShift();

  const completedCount = waypoints.filter((w) => w.status === 'completed').length;
  const inProgressCount = waypoints.filter((w) => w.status === 'in_progress').length;
  const pendingMissions = waypoints.filter((w) => w.status === 'pending').length;

  return (
    <div className="admin-shell">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--wp-text-primary)' }}>
          {t('shells.admin.title', 'System Administration')}
        </h1>
        <p style={{ color: 'var(--wp-text-secondary)', fontSize: '0.95rem' }}>
          Logged in as <strong>{currentUser.name}</strong> • Role Shell: <code>admin</code>
        </p>
      </div>

      <div className="grid-4" style={{ marginBottom: '24px' }}>
        <div className="card" style={{ borderLeft: '4px solid var(--wp-role-admin-accent)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--wp-text-secondary)' }}>Total Waypoints</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{waypoints.length}</div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--wp-status-in-progress)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--wp-text-secondary)' }}>In Progress</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{inProgressCount}</div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--wp-status-completed)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--wp-text-secondary)' }}>Completed</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{completedCount}</div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--wp-text-secondary)' }}>Pending Sync Queue</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{pendingCount}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <span>{t('shells.admin.system_health', 'System Diagnostics')}</span>
            <span className="badge badge-online">Operational</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--wp-text-secondary)' }}>Colombo Shift:</span>
              <strong style={{ textTransform: 'capitalize' }}>{currentShift} Shift</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--wp-text-secondary)' }}>Standard Business Hours:</span>
              <span>{isWorkHours ? '✅ Active' : '⏸ Off-hours'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--wp-text-secondary)' }}>Last Server Sync:</span>
              <span>{lastSyncedAt ? formatColomboDateTime(lastSyncedAt) : 'Not synced yet'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--wp-text-secondary)' }}>Modular API Status:</span>
              <span>Go 1.23 Monolith (Port 8080)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--wp-text-secondary)' }}>ML Inference Service:</span>
              <span>FastAPI (Port 8000)</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>{t('shells.admin.user_management', 'Role Directory')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { role: 'admin', name: 'System Admin', email: 'admin@waypoint.local' },
              { role: 'dispatcher', name: 'Central Dispatcher', email: 'dispatcher@waypoint.local' },
              { role: 'field_agent', name: 'Field Inspector', email: 'field@waypoint.local' },
              { role: 'driver', name: 'Logistics Driver', email: 'driver@waypoint.local' },
            ].map((u) => (
              <div key={u.email} style={{ padding: '8px 12px', background: 'var(--wp-bg-subtle)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--wp-text-secondary)' }}>{u.email}</div>
                </div>
                <span className="badge" style={{ background: 'white' }}>{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
