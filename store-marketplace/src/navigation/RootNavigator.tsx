import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/context/AuthContext";
import { SignInScreen } from "@/screens/auth/SignInScreen";
import { SignUpScreen } from "@/screens/auth/SignUpScreen";
import { DiscoverScreen } from "@/screens/customer/DiscoverScreen";
import { FollowedStoresScreen } from "@/screens/customer/FollowedStoresScreen";
import { NotificationsScreen } from "@/screens/customer/NotificationsScreen";
import { ProfileScreen } from "@/screens/customer/ProfileScreen";
import { StoreDetailScreen } from "@/screens/customer/StoreDetailScreen";
import { BusinessOnboardingScreen } from "@/screens/owner/BusinessOnboardingScreen";
import { BusinessVerificationScreen } from "@/screens/owner/BusinessVerificationScreen";
import { BusinessDashboardScreen } from "@/screens/owner/BusinessDashboardScreen";
import { StockEditorScreen } from "@/screens/owner/StockEditorScreen";
import { AnnouncementComposerScreen } from "@/screens/owner/AnnouncementComposerScreen";
import { TeamManagementScreen } from "@/screens/owner/TeamManagementScreen";
import { StoreChatScreen } from "@/screens/StoreChatScreen";

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

export type MainTabParamList = {
  Discover: undefined;
  Followed: undefined;
  Notifications: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  StoreDetail: { businessId: string };
  BusinessOnboarding: undefined;
  BusinessVerification: { businessId: string };
  BusinessDashboard: { businessId: string };
  StockEditor: { businessId: string; itemId?: string };
  AnnouncementComposer: { businessId: string };
  TeamManagement: { businessId: string };
  StoreChat: { businessId: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="SignIn" component={SignInScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Discover: "search-outline",
  Followed: "heart-outline",
  Notifications: "notifications-outline",
  Profile: "person-outline",
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
        tabBarActiveTintColor: "#4F46E5",
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Followed" component={FollowedStoresScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Main" component={MainTabs} />
      <RootStack.Screen
        name="StoreDetail"
        component={StoreDetailScreen}
        options={{ headerShown: true, title: "" }}
      />
      <RootStack.Screen
        name="BusinessOnboarding"
        component={BusinessOnboardingScreen}
        options={{ headerShown: true, title: "Create your business" }}
      />
      <RootStack.Screen
        name="BusinessVerification"
        component={BusinessVerificationScreen}
        options={{ headerShown: true, title: "Verify your business" }}
      />
      <RootStack.Screen
        name="BusinessDashboard"
        component={BusinessDashboardScreen}
        options={{ headerShown: true, title: "Dashboard" }}
      />
      <RootStack.Screen
        name="StockEditor"
        component={StockEditorScreen}
        options={{ headerShown: true, title: "Item" }}
      />
      <RootStack.Screen
        name="AnnouncementComposer"
        component={AnnouncementComposerScreen}
        options={{ headerShown: true, title: "New announcement" }}
      />
      <RootStack.Screen
        name="TeamManagement"
        component={TeamManagementScreen}
        options={{ headerShown: true, title: "Team & moderation" }}
      />
      <RootStack.Screen
        name="StoreChat"
        component={StoreChatScreen}
        options={{ headerShown: true, title: "Chat" }}
      />
    </RootStack.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#101828" }}>
        <ActivityIndicator color="#4F46E5" size="large" />
      </View>
    );
  }

  return <NavigationContainer>{user ? <AppNavigator /> : <AuthNavigator />}</NavigationContainer>;
}
