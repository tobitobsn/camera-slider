/**
 * Design tokens from docs/design-system.md. Dark is the default theme for
 * this app (matches a video/photo tool, doesn't blend on set) — PROJ-1 ships
 * dark only; light-mode values are recorded in the design system for later.
 */
export const colors = {
  background: '#121212',
  surface: '#1E1E1E',
  foreground: '#F2F2F2',
  mutedForeground: '#A3A3A3',
  primary: '#F59E0B',
  primaryHover: '#FBBF24',
  primaryActive: '#D97706',
  primarySubtleBg: '#3A2A0A',
  destructive: '#EF4444',
  border: '#2E2E2E',
} as const;

export const radius = {
  base: 12,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const typography = {
  size: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  weight: {
    body: '400' as const,
    heading: '600' as const,
  },
} as const;

/** Minimum touch target for buttons/controls (design-system.md → Komponenten-Konventionen). */
export const minTouchTarget = 56;
