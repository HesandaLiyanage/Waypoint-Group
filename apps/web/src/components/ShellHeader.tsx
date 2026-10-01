import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useSync } from '../context/SyncContext';
import { formatColomboTime, formatColomboDateTime, UserRole } from '@waypoint/domain';
import { Locale } from '@waypoint/i18n';

export const ShellHeader: React.FC = () => {
  const { activeRole, setRole, currentUser } = useAuth();
  const { locale, setLocale, t, locales } = useI18n();
  const { isOnline, isSyncing, pendingCount, triggerSync } = useSync();

  const [colomboClock, setColomboClock] = useState<string>(formatColomboTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setColomboClock(formatColomboTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const roles: { id: UserRole; label: string }[] = [
    { id: 'admin', label: t('roles.admin', 'Admin') },
    { id: 'dispatcher', label: t('roles.dispatcher', 'Dispatcher') },
    { id: 'field_agent', label: t('roles.field_agent', 'Field Agent') },
    { id: 'driver', label: t('roles.driver', 'Driver') },
  ];

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-badge">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <span>Waypoint</span>
        </div>

        {/* 4 Role Shell Switcher */}
        <div className="role-switcher">
          {roles.map((r) => (
            <button
              key={r.id}
              className={`role-btn ${activeRole === r.id ? 'active' : ''}`}
              onClick={() => setRole(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="header-right">
        {/* Asia/Colombo Clock */}
        <div className="colombo-clock" title="Sri Lanka Standard Time (Asia/Colombo UTC+05:30)">
          🇱🇰 {colomboClock} LK
        </div>

        {/* Online / Offline / Sync Status */}
        {isSyncing ? (
          <span className="badge badge-syncing">
            ⚡ {t('app.syncing_badge', 'Syncing...')}
          </span>
        ) : isOnline ? (
          <span className="badge badge-online">
            ● {t('app.online_badge', 'Online')}
          </span>
        ) : (
          <span className="badge badge-offline">
            ○ {t('app.offline_badge', 'Offline')}
          </span>
        )}

        {/* Pending Outbox Mutations */}
        {pendingCount > 0 && (
          <button
            onClick={() => triggerSync()}
            className="badge badge-syncing"
            style={{ border: 'none', cursor: 'pointer' }}
            title="Click to sync outbox changes"
          >
            ⬆ {pendingCount} queued
          </button>
        )}

        {/* Language selector (en, si, ta) */}
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="lang-select"
          aria-label="Select language"
        >
          {Object.entries(locales).map(([code, meta]) => (
            <option key={code} value={code}>
              {meta.nativeName} ({code.toUpperCase()})
            </option>
          ))}
        </select>
      </div>
    </header>
  );
};
