import React, { ReactNode, useState, useEffect, useRef } from "react";
import { StyleSheet, Platform, InteractionManager, AppState, useWindowDimensions, type AppStateStatus } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CallProvider } from "@/contexts/CallContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import IncomingCallModal from "@/components/IncomingCallModal";
import { InAppNotificationBanner } from "@/components/InAppNotificationBanner";
import { ConcurrentSessionAlert } from "@/components/ConcurrentSessionAlert";
import { ShoulderSurfingGuard } from "@/components/ShoulderSurfingGuard";
import { logCheckpoint, deferToNextFrame } from "@/lib/launchInstrumentation";

// LiveKit WebRTC globals must be registered ONCE before any LiveKit Room is
// constructed (otherwise mic/speaker tracks never wire up and calls connect
// with no audio). We kick this off at app start so it's almost certainly
// done by the time the user places a call; the authoritative init-barrier
// (`ensureLiveKitInitialized()` inside livekitService) is what actually
// guarantees the ordering before Room construction.
if (Platform.OS !== "web") {
  import("@/services/livekitService").then(({ ensureLiveKitInitialized }) => {
    ensureLiveKitInitialized()
      .then(() => logCheckpoint("livekit_globals_registered"))
      .catch((e) => logCheckpoint(`livekit_globals_skipped: ${String(e).slice(0, 80)}`));
  });
}

function SafeKeyboardProvider({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    let mounted = true;
    deferToNextFrame(() => {
      if (!mounted) return;
      import("react-native-keyboard-controller")
        .then((mod) => {
          if (mounted && mod.KeyboardProvider) {
            setProvider(() => mod.KeyboardProvider);
            logCheckpoint('keyboard_provider_loaded');
          }
        })
        .catch(() => logCheckpoint('keyboard_provider_fallback'));
    });
    return () => { mounted = false; };
  }, []);

  return Provider ? <Provider>{children}</Provider> : <>{children}</>;
}

/**
 * On every transition to "active" (app foregrounded) by an authenticated user,
 * give the prekey manager a chance to rotate a stale signed prekey. All work
 * is best-effort — failures are swallowed so a flaky network on resume can
 * never crash app startup or interrupt the user.
 */
function PreKeyMaintenanceGuard() {
  const { user, token } = useAuth() as { user: { id: string } | null; token: string | null };
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    if (!user || !token) return;

    const run = () => {
      // Debounce: don't re-check more often than once an hour even if AppState
      // flaps. SPK rotation only matters at day granularity.
      const now = Date.now();
      if (now - lastRunRef.current < 60 * 60 * 1000) return;
      lastRunRef.current = now;

      (async () => {
        try {
          const { rotateSignedPreKeyIfStale } = await import("@/utils/crypto/prekeyManager");
          const { getApiUrl } = await import("@/lib/query-client");
          const apiBase = (typeof getApiUrl === "function" ? getApiUrl() : "").replace(/\/$/, "");
          if (!apiBase) return;
          await rotateSignedPreKeyIfStale(token, apiBase);
          logCheckpoint("spk_rotation_checked");
        } catch (e) {
          // Best-effort. Network errors, missing endpoints, missing signing
          // key — all non-fatal. Will retry on next foreground.
          logCheckpoint(`spk_rotation_skipped: ${String(e).slice(0, 80)}`);
        }
      })();
    };

    // Run once on mount (covers cold start), then on every active transition.
    deferToNextFrame(run);

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") run();
    });
    return () => { sub.remove(); };
  }, [user?.id, token]);

  return null;
}

async function initApp() {
  try {
    logCheckpoint('init_app_start');

    let trackingAuthorized = false;
    if (Platform.OS === "ios") {
      try {
        const { requestTrackingPermissionsAsync } = await import("expo-tracking-transparency");
        const { status } = await requestTrackingPermissionsAsync();
        trackingAuthorized = status === 'granted';
        logCheckpoint(`tracking_permission_${status}`);
      } catch {
        logCheckpoint('tracking_permission_failed');
      }
    }

    if (Platform.OS !== 'web') {
      try {
        const { mobileAds, MaxAdContentRating, isAdMobAvailable } = await import('@/utils/admobModule');
        if (isAdMobAvailable && mobileAds) {
          // GDPR / UK GDPR / Swiss FADP: Google requires UMP (Consent SDK) before
          // serving ads in the EEA / UK / Switzerland. We always call it — outside
          // regulated geographies the SDK returns OBTAINED/NOT_REQUIRED and is a
          // no-op. Failure is non-fatal: ads still load as non-personalized.
          try {
            const { AdsConsent } = await import('react-native-google-mobile-ads');
            await AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: false });
            logCheckpoint('admob_ump_gathered');
          } catch (e) {
            logCheckpoint(`admob_ump_skipped: ${e}`);
          }

          if (MaxAdContentRating?.PG) {
            await mobileAds().setRequestConfiguration({
              maxAdContentRating: MaxAdContentRating.PG,
              tagForChildDirectedTreatment: false,
              tagForUnderAgeOfConsent: false,
            });
          }
          await mobileAds().initialize();
          logCheckpoint(`admob_initialized_tracking_${trackingAuthorized}`);
        }
      } catch (e) {
        logCheckpoint(`admob_init_skipped: ${e}`);
      }
    }

    const { initializeSounds } = await import('@/utils/sounds');
    await initializeSounds();

    logCheckpoint('init_app_complete');
  } catch (e) {
    console.log('Init error:', e);
    logCheckpoint(`init_app_error: ${e}`);
  }
}

export default function MainApp() {
  const hasInit = useRef(false);
  const { width } = useWindowDimensions();

  // Native (iOS/Android, incl. iPad) always uses the full device width. On the
  // web build & desktop browsers we still center the app, but let it grow into a
  // comfortably wide column on large screens (up to 900) instead of a cramped
  // phone strip — while capping it so inputs don't stretch edge-to-edge on
  // ultra-wide monitors.
  const rootStyle =
    Platform.OS === 'web'
      ? [styles.root, { width: '100%' as const, maxWidth: Math.min(width, 900), alignSelf: 'center' as const }]
      : styles.root;

  useEffect(() => {
    logCheckpoint('main_app_mounted');

    if (!hasInit.current) {
      hasInit.current = true;
      InteractionManager.runAfterInteractions(() => {
        deferToNextFrame(() => {
          initApp();
        });
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PreKeyMaintenanceGuard />
          <SafeAreaProvider>
            <GestureHandlerRootView style={rootStyle}>
              <SafeKeyboardProvider>
                <NavigationContainer
                  onReady={() => logCheckpoint('navigation_ready')}
                >
                  <NotificationProvider>
                    <CallProvider>
                      <RootStackNavigator />
                      <IncomingCallModal />
                      <InAppNotificationBanner />
                      <ConcurrentSessionAlert />
                      <ShoulderSurfingGuard />
                    </CallProvider>
                  </NotificationProvider>
                </NavigationContainer>
                <StatusBar style="auto" />
              </SafeKeyboardProvider>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
