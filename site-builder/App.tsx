import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { AppThemeProvider, useAppTheme } from '@/context/AppThemeContext';
import RootNavigator from '@/navigation/RootNavigator';
import ErrorBoundary from '@/components/ErrorBoundary';
import { installGlobalErrorHandler } from '@/utils/globalErrorHandler';
import { initCrashReporting } from '@/services/crashReporting';
import { checkForOtaUpdate } from '@/services/otaUpdates';

initCrashReporting();
installGlobalErrorHandler();

function ThemedStatusBar() {
  const { theme } = useAppTheme();
  return <StatusBar style={theme.statusBarStyle} />;
}

export default function App() {
  useEffect(() => {
    checkForOtaUpdate();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppThemeProvider>
          <ThemedStatusBar />
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
