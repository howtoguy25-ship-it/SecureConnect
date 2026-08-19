import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View, type AppStateStatus } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { hasAppLockPin, getAppLockSettings } from "@/utils/appLock";
import AppLockScreen from "@/screens/AppLockScreen";

/**
 * Renders the App Lock overlay on cold launch (when a user is signed in and
 * has a PIN set) and again after the app resumes from background past its
 * configured timeout. Sits as a sibling to RootStackNavigator in MainApp so
 * it covers all app content but not the IncomingCallModal/notification
 * banners rendered after it — those stay reachable even while locked.
 */
export function AppLockGate() {
  const { user, isLoading } = useAuth();
  const { theme } = useTheme();
  const [locked, setLocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const checkOnEntry = useCallback(async () => {
    const has = await hasAppLockPin();
    setLocked(has);
    setChecked(true);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocked(false);
      setChecked(true);
      return;
    }
    checkOnEntry();
  }, [user?.id, isLoading, checkOnEntry]);

  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener("change", async (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next === "background" || next === "inactive") {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (next === "active" && (prev === "background" || prev === "inactive")) {
        const has = await hasAppLockPin();
        if (!has) return;
        const settings = await getAppLockSettings();
        const timeoutMs = (settings?.timeoutSeconds ?? 0) * 1000;
        const elapsed = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : Infinity;
        if (elapsed >= timeoutMs) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  if (!user) return null;
  if (!checked) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.backgroundRoot, zIndex: 999 }]} />;
  }
  if (!locked) return null;

  return <AppLockScreen onUnlock={() => setLocked(false)} />;
}
