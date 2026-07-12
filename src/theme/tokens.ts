// Shared design tokens for the mobile app -- colors mirror the web app's palette
// (web/src/App.css, web/src/types/alert.ts) so both surfaces read as one brand.
export const colors = {
  accent: "#2563EB",
  dark: "#111827",
  danger: "#DC2626",
  warning: "#F59E0B",
  surface: "#FFFFFF",
  surfaceMuted: "#F9FAFB",
  border: "#E5E7EB",
  text: "#111827",
  textMuted: "#6B7280",
  textFaint: "#9CA3AF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 999,
} as const;

export const shadow = {
  low: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  medium: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  high: {
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
} as const;

// Standard opacity a Pressable dims to while held, for consistent tactile feedback
// across every button in the app instead of some buttons having it and others not.
export const pressedOpacity = 0.7;
