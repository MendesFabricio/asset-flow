export const colors = {
  primary: {
    DEFAULT: '#3b82f6',
    soft: '#60a5fa',
    deep: '#2563eb',
  },
  success: {
    DEFAULT: '#10b981',
    soft: '#34d399',
    deep: '#059669',
  },
  warning: {
    DEFAULT: '#f59e0b',
    soft: '#fbbf24',
    deep: '#d97706',
  },
  danger: {
    DEFAULT: '#ef4444',
    soft: '#f87171',
    deep: '#e11d48',
  },
  info: {
    DEFAULT: '#8b5cf6',
    soft: '#a78bfa',
    deep: '#7c3aed',
  },
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
} as const;

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  xl: '20px',
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.25)',
  md: '0 4px 20px -2px rgba(15, 23, 42, 0.25), 0 2px 6px -1px rgba(15, 23, 42, 0.15)',
  lg: '0 10px 40px -4px rgba(15, 23, 42, 0.4)',
} as const;

export const spacing = {
  grid: 4,
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
} as const;

export type ThemeColor = keyof typeof colors;
export type RadiusToken = keyof typeof radius;
export type ShadowToken = keyof typeof shadows;
