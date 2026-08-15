export type AppThemeId = 'light' | 'black' | 'purple' | 'blue';

export interface AppTheme {
  id: AppThemeId;
  name: string;
  statusBarStyle: 'light' | 'dark';
  background: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string; // legible text/icon color to put ON TOP of `accent`
  // Optional subtle glow color for headline/accent text -- only purple currently uses this,
  // kept deliberately faint (see AccountScreen's Appearance section) so it reads as
  // "aesthetic," not a neon sign.
  glow?: string;
}

// Every theme is chosen so its own text colors always have real contrast against its own
// background/surface -- e.g. Black never uses pure #FFFFFF body text (glare-bright against
// true black), Purple's aqua text is light enough to stay readable on deep purple, Blue's
// text is a pale blue-white that doesn't fight the navy background.
export const APP_THEMES: Record<AppThemeId, AppTheme> = {
  light: {
    id: 'light',
    name: 'White (Normal)',
    statusBarStyle: 'dark',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    border: '#E2E8F0',
    text: '#0F172A',
    textMuted: '#64748B',
    accent: '#2563EB',
    accentText: '#FFFFFF',
  },
  black: {
    id: 'black',
    name: 'Black',
    statusBarStyle: 'light',
    background: '#000000',
    surface: '#141414',
    card: '#1C1C1E',
    border: '#2E2E31',
    // Soft warm-white, not pure #FFFFFF -- easier on the eyes on true black, no glare.
    text: '#EDEDED',
    textMuted: '#9A9A9E',
    accent: '#22D3EE',
    accentText: '#001014',
  },
  purple: {
    id: 'purple',
    name: 'Purple',
    statusBarStyle: 'light',
    background: '#2E1065',
    surface: '#3B0B78',
    card: '#42127F',
    border: '#5B21B6',
    text: '#CFFAFE',
    textMuted: '#C4B5FD',
    accent: '#22D3EE',
    accentText: '#0B1120',
    glow: '#67E8F9',
  },
  blue: {
    id: 'blue',
    name: 'Blue',
    statusBarStyle: 'light',
    background: '#0B1220',
    surface: '#111C33',
    card: '#152443',
    border: '#1E3A5F',
    text: '#DBEAFE',
    textMuted: '#93C5FD',
    accent: '#3B82F6',
    accentText: '#FFFFFF',
  },
};

export const APP_THEME_ORDER: AppThemeId[] = ['light', 'black', 'purple', 'blue'];
