import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { AppThemeProvider, useAppTheme } from '@/context/AppThemeContext';
import RootNavigator from '@/navigation/RootNavigator';

function ThemedStatusBar() {
  const { theme } = useAppTheme();
  return <StatusBar style={theme.statusBarStyle} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <ThemedStatusBar />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
