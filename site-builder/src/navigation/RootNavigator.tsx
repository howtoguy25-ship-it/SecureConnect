import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/config/env';
import AuthNavigator from '@/navigation/AuthNavigator';
import FirebaseSetupScreen from '@/screens/FirebaseSetupScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import NewProjectScreen from '@/screens/NewProjectScreen';
import BuildMethodScreen from '@/screens/BuildMethodScreen';
import ThemeGalleryScreen from '@/screens/ThemeGalleryScreen';
import AIPromptScreen from '@/screens/AIPromptScreen';
import AIBuildProgressScreen from '@/screens/AIBuildProgressScreen';
import SubscriptionScreen from '@/screens/SubscriptionScreen';
import EditorScreen from '@/screens/EditorScreen';
import AccountScreen from '@/screens/AccountScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Projects" component={ProjectsScreen} />
      <Stack.Screen name="NewProject" component={NewProjectScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="BuildMethod" component={BuildMethodScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ThemeGallery" component={ThemeGalleryScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AIPrompt" component={AIPromptScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AIBuildProgress" component={AIBuildProgressScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Editor" component={EditorScreen} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, initializing } = useAuth();

  if (!env.isFirebaseConfigured) {
    return <FirebaseSetupScreen />;
  }

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1220' }}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return <NavigationContainer>{user ? <AppStack /> : <AuthNavigator />}</NavigationContainer>;
}
