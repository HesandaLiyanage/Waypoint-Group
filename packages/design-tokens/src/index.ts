export const colors = {
  brand: {
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primaryLight: '#60a5fa',
    secondary: '#0f172a',
  },
  surface: {
    base: '#f8fafc',
    surface: '#ffffff',
    subtle: '#f1f5f9',
    borderSubtle: '#e2e8f0',
    borderStrong: '#cbd5e1',
  },
  text: {
    primary: '#0f172a',
    secondary: '#64748b',
    muted: '#94a3b8',
    inverse: '#ffffff',
  },
  status: {
    pending: '#f59e0b',
    assigned: '#3b82f6',
    inProgress: '#8b5cf6',
    completed: '#10b981',
    failed: '#ef4444',
    cancelled: '#6b7280',
  },
  roleShells: {
    admin: {
      accent: '#6366f1',
      background: '#eef2ff',
      text: '#312e81',
      label: 'Administrator',
    },
    dispatcher: {
      accent: '#0284c7',
      background: '#e0f2fe',
      text: '#0369a1',
      label: 'Dispatcher / Supervisor',
    },
    fieldAgent: {
      accent: '#059669',
      background: '#ecfdf5',
      text: '#065f46',
      label: 'Field Agent / Inspector',
    },
    driver: {
      accent: '#d97706',
      background: '#fffbeb',
      text: '#92400e',
      label: 'Driver / Crew',
    },
  },
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
} as const;

export const radii = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
} as const;

export type RoleThemeKey = keyof typeof colors.roleShells;
export type StatusColorKey = keyof typeof colors.status;
