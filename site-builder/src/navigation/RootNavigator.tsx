import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { navigationRef } from '@/navigation/navigationRef';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/config/env';
import AuthNavigator from '@/navigation/AuthNavigator';
import AssistantLauncher from '@/components/assistant/AssistantLauncher';
import BillingBanner from '@/components/BillingBanner';
import OrderBanner from '@/components/OrderBanner';
import AppOpenAdManager from '@/components/AppOpenAdManager';
import FirebaseSetupScreen from '@/screens/FirebaseSetupScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import NewProjectScreen from '@/screens/NewProjectScreen';
import BuildMethodScreen from '@/screens/BuildMethodScreen';
import ThemeGalleryScreen from '@/screens/ThemeGalleryScreen';
import AIPromptScreen from '@/screens/AIPromptScreen';
import AIBuildProgressScreen from '@/screens/AIBuildProgressScreen';
import SubscriptionScreen from '@/screens/SubscriptionScreen';
import EditorScreen from '@/screens/EditorScreen';
import PublishScreen from '@/screens/PublishScreen';
import BuyDomainScreen from '@/screens/BuyDomainScreen';
import TransferDomainScreen from '@/screens/TransferDomainScreen';
import PolicyScreen from '@/screens/PolicyScreen';
import SupportScreen from '@/screens/SupportScreen';
import AccountScreen from '@/screens/AccountScreen';
import SellerAccountScreen from '@/screens/SellerAccountScreen';
import OrdersScreen from '@/screens/OrdersScreen';

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
      <Stack.Screen name="Publish" component={PublishScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="BuyDomain" component={BuyDomainScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="TransferDomain" component={TransferDomainScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Policy" component={PolicyScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Support" component={SupportScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="SellerAccount" component={SellerAccountScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Orders" component={OrdersScreen} options={{ presentation: 'modal' }} />
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

  return (
    <NavigationContainer ref={navigationRef}>
      {user ? (
        <>
          <AppStack />
          <AssistantLauncher />
          <BillingBanner />
          <OrderBanner />
          <AppOpenAdManager />
        </>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
