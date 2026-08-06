import React, { useRef } from "react";
import { NavigationContainer, type NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MapScreen } from "@/screens/MapScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { SignInScreen } from "@/screens/SignInScreen";
import { VehicleHistoryScreen } from "@/screens/VehicleHistoryScreen";
import { RevCheckScreen } from "@/screens/RevCheckScreen";
import { navigationIntegration } from "@/services/sentry";

export type RevCheckParams = {
  // Prefilled plate -- from tapping a saved vehicle history entry, or a "Run REV Check" tap in
  // the live AI detection detail panel. Left undefined for a blank manual entry.
  plate?: string;
  state?: string;
  // Only present when opened from a live/saved AI detection -- shown as a read-only summary
  // card above the check form, per the explicit "display Speed Travelling, Number Plate" ask.
  vehicleLabel?: "Vehicle" | "Heavy Vehicle";
  speedKmh?: number | null;
  speedKind?: "absolute" | "closing" | null;
};

export type RootStackParamList = {
  Map: undefined;
  Settings: undefined;
  SignIn: undefined;
  VehicleHistory: undefined;
  RevCheck: RevCheckParams | undefined;
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
        <Stack.Screen
          name="SignIn"
          component={SignInScreen}
          options={{ headerShown: true, title: "Sign In" }}
        />
        <Stack.Screen
          name="VehicleHistory"
          component={VehicleHistoryScreen}
          options={{ headerShown: true, title: "Vehicle History" }}
        />
        <Stack.Screen
          name="RevCheck"
          component={RevCheckScreen}
          options={{ headerShown: true, title: "REV Check" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
