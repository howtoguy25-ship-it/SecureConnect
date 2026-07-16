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

// Installed at module scope so it's active as early as this file is ever imported/evaluated
// -- before any provider or component below even mounts. See crashReporter.ts for why this
// exists: Apple's own .ips crash reports only ever show the generic RN bridge frames for a
// fatal JS error (RCTExceptionsManager reportFatal:), never the actual message/stack, which
// is exactly the wall this app hit investigating real TestFlight crashes this session.
installCrashReporter();

export default function App() {
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
