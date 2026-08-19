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
      // Only a real "background" (the app fully suspended — home button,
      // app switcher, the screen locked with the power button) starts the
      // lock-timeout clock. "inactive" alone is what iOS reports for
      // transient system overlays that never actually leave the app — the
      // share sheet, a photo/camera picker, a permission prompt, Control
      // Center, an incoming call banner, Siri. Treating those the same as
      // a real backgrounding meant "Immediately" (and even short timeouts)
      // locked the app the instant one of those closed, which reads as
      // "it asks for my PIN constantly" even though the user never left.
      if (next === "background") {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (next === "active" && prev === "background") {
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
