import "react-native-get-random-values"; 
import React, { useState, useEffect } from "react";
import { StyleSheet, View, Text } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { logCheckpoint, logMemory } from "@/lib/launchInstrumentation";
import { hideSplashScreen } from "@/lib/splashScreen";
import { installCrashReporter, flushPendingCrashReport } from "@/lib/crashReporter";
import MainApp from "@/MainApp";

logCheckpoint('app_module_start');

// Capture any fatal JS error (message + stack), persist it, and report it to
// the server so production logs show the exact cause of TestFlight crashes.
installCrashReporter();

SplashScreen.preventAutoHideAsync();

logCheckpoint('splash_setup_complete');

export default function App() {
  const [appReady, setAppReady] = useState(false);

  logCheckpoint('app_render_start');

  useEffect(() => {
    logCheckpoint('app_useEffect_start');
    logMemory();

    // If the previous run died on a fatal error, upload the saved report now.
    flushPendingCrashReport();

    const splashTimer = setTimeout(() => {
      hideSplashScreen();
      setAppReady(true);
      logCheckpoint('splash_hidden_timed');
    }, 300);

    return () => clearTimeout(splashTimer);
  }, []);

  logCheckpoint('app_render_jsx');

  if (!appReady) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return <MainApp />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D0A1A",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
});

logCheckpoint('app_module_end');
