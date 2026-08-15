import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTheme, AppThemeId, APP_THEMES } from '@/theme/appThemes';

const STORAGE_KEY = 'sitespark.appTheme';

interface AppThemeContextValue {
  theme: AppTheme;
  themeId: AppThemeId;
  setThemeId: (id: AppThemeId) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

// A real, persisted (device-local) app-wide appearance preference -- separate from the
// per-website "Theme" gallery (colors/fonts for a site someone is building). Loads once on
// launch and applies instantly; picked from AccountScreen's Appearance section.
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<AppThemeId>('light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in APP_THEMES) setThemeIdState(stored as AppThemeId);
    });
  }, []);

  const setThemeId = (id: AppThemeId) => {
    setThemeIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  };

  return (
    <AppThemeContext.Provider value={{ theme: APP_THEMES[themeId], themeId, setThemeId }}>{children}</AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}
