import React from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/context/AuthContext";
import { LocationProvider } from "@/context/LocationContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { RootNavigator } from "@/navigation/RootNavigator";
import { AppOpenAdManager } from "@/components/AppOpenAdManager";
import { AdsErrorBoundary } from "@/components/AdsErrorBoundary";
import { installCrashReporter } from "@/services/crashReporter";
import { initSentry, Sentry } from "@/services/sentry";

// Installed at module scope so it's active as early as this file is ever imported/evaluated
// -- before any provider or component below even mounts. See crashReporter.ts for why this
// exists: Apple's own .ips crash reports only ever show the generic RN bridge frames for a
// fatal JS error (RCTExceptionsManager reportFatal:), never the actual message/stack, which
// is exactly the wall this app hit investigating real TestFlight crashes this session.
//
// initSentry() must run second -- see sentry.ts for why the order matters.
installCrashReporter();
initSentry();

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsProvider>
            <LocationProvider>
              <StatusBar style="dark" />
              <AdsErrorBoundary>
                <AppOpenAdManager />
              </AdsErrorBoundary>
              <RootNavigator />
            </LocationProvider>
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap is a no-op passthrough when initSentry() above skipped (no DSN set) -- safe to
// always include. Adds automatic screen/breadcrumb tracking and catches render-phase errors
// Sentry's own way when a DSN is configured.
export default Sentry.wrap(App);
