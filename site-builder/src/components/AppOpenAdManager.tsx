import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { preloadAppOpenAd, showAppOpenAdIfAvailable } from '@/services/appOpenAd';

// Invisible -- just preloads an app-open ad on mount and shows it whenever the app comes
// back to the foreground from being backgrounded (not on this very first mount, so a cold
// launch always lands the signed-in user straight on their Projects screen instead of an
// ad first).
export default function AppOpenAdManager() {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    preloadAppOpenAd();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        showAppOpenAdIfAvailable();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  return null;
}
