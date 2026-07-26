import React, { useRef } from "react";
import { NavigationContainer, type NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MapScreen } from "@/screens/MapScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { navigationIntegration } from "@/services/sentry";

export type RootStackParamList = {
  Map: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => navigationIntegration.registerNavigationContainer(navigationRef)}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerShown: true, title: "Settings" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
