import React from "react";
import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";

export type MainTabParamList = {
  HomeTab: undefined;
  ProfileTab: undefined;
};

const Tab = createNativeBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator26() {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: "Home",
          // @ts-ignore - experimental native tab navigator supports sfSymbol icons
          icon: {
            sfSymbolName: "house",
          },
          // @ts-ignore
          selectedIcon: {
            sfSymbolName: "house.fill",
          },
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          title: "Profile",
          // @ts-ignore - experimental native tab navigator supports sfSymbol icons
          icon: {
            sfSymbolName: "person",
          },
          // @ts-ignore
          selectedIcon: {
            sfSymbolName: "person.fill",
          },
        }}
      />
    </Tab.Navigator>
  );
}
