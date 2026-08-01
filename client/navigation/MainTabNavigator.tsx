import React, { useState, useEffect, useCallback } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { TabColors } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import ChatsScreen from "@/screens/ChatsScreen";
import StatusScreen from "@/screens/StatusScreen";
import LocationScreen from "@/screens/LocationScreen";
import CallsScreen from "@/screens/CallsScreen";
import ProfileScreen from "@/screens/ProfileScreen";
// LockerTabScreen replaced by HiddenLockerScreen (Locker Phase 1 — encryption at rest).
// LockerTabScreen used the legacy 4-digit plaintext flow and is kept on disk only for
// historical reference; do not import it.
import HiddenLockerScreen from "@/screens/HiddenLockerScreen";

export type MainTabParamList = {
  ChatsTab: undefined;
  LockerTab: undefined;
  StatusTab: undefined;
  LocationTab: undefined;
  CallsTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();
  const { user, numberMode } = useAuth();
  const insets = useSafeAreaInsets();
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const token = await getStoredToken();
      if (!token) return;
      
      const baseUrl = getApiUrl();
      const url = new URL('/api/conversations', baseUrl);
      url.searchParams.set('numberType', numberMode);
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const conversations = await response.json();
        // Archived conversations (e.g. a declined message request) don't
        // show up in the chat list at all, but their unreadCount was never
        // reset — "seen" is deliberately suppressed while a request is
        // still pending, so a declined request's stale unread count would
        // otherwise inflate this badge forever, even though the user
        // already answered it.
        const total = conversations.reduce((sum: number, conv: any) => sum + (conv.isArchived ? 0 : (conv.unreadCount || 0)), 0);
        setTotalUnreadCount(total);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [numberMode]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 10000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return (
    <Tab.Navigator
      initialRouteName="ChatsTab"
      screenOptions={{
        tabBarActiveTintColor: theme.tabIconSelected,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarShowLabel: true,
        tabBarLabelPosition: "below-icon",
        tabBarHideOnKeyboard: true,
        tabBarStyle: (() => {
          // Web mobile browsers (Chrome/Safari) often overlap the viewport with their
          // bottom URL bar and don't report it via safe-area insets. Force a minimum
          // bottom inset on web so tab labels never sit underneath the browser chrome.
          const isWeb = Platform.OS === "web";
          // On native, insets.bottom already includes the home-indicator height
          // (~34 on iOS notch devices). On web, browsers don't report it, so
          // force a minimum so labels clear the browser's bottom URL bar.
          const bottomInset = isWeb ? Math.max(insets.bottom, 28) : insets.bottom;
          return {
            height: 60 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 6,
            paddingHorizontal: 8,
            // Transparent tab bar: on iOS the BlurView below supplies the
            // frosted-glass fill, so this stays fully transparent. Android
            // and web have no native blur here, so they get a translucent
            // wash of the current theme's own background instead of a
            // flat opaque color, tinted rather than a solid black bar in
            // every theme.
            backgroundColor: Platform.select({
              ios: "transparent",
              android: isDark ? "rgba(10, 10, 10, 0.85)" : "rgba(255, 255, 255, 0.85)",
              default: isDark ? "rgba(10, 10, 10, 0.85)" : "rgba(255, 255, 255, 0.85)",
            }),
            borderTopWidth: 0.5,
            borderTopColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)",
            elevation: 0,
          };
        })(),
        tabBarItemStyle: {
          paddingHorizontal: 0,
          paddingVertical: 0,
        },
        // Six tabs on a narrow iPhone: keep labels compact, never let iOS
        // accessibility font scaling blow them up, and give the text the full
        // tile width so "Location"/"Profile" render every letter.
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
          marginTop: 2,
          marginBottom: 0,
          marginHorizontal: 0,
          includeFontPadding: false,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="ChatsTab"
        component={ChatsScreen}
        options={{
          title: "Chats",
          tabBarActiveTintColor: TabColors.chats,
          tabBarIcon: ({ focused }) => (
            <Feather name="message-circle" size={22} color={focused ? TabColors.chats : theme.tabIconDefault} />
          ),
          tabBarBadge: totalUnreadCount > 0 ? totalUnreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#22C55E',
            color: '#fff',
            fontSize: 11,
            fontWeight: '600',
            minWidth: 18,
            height: 18,
            borderRadius: 9,
          },
        }}
      />
      {user?.isVip ? (
        <Tab.Screen
          name="LockerTab"
          component={HiddenLockerScreen}
          options={{
            title: "Locker",
            tabBarActiveTintColor: TabColors.locker,
            tabBarIcon: ({ focused }) => (
              <Feather name="lock" size={22} color={focused ? TabColors.locker : theme.tabIconDefault} />
            ),
          }}
        />
      ) : null}
      <Tab.Screen
        name="StatusTab"
        component={StatusScreen}
        options={{
          title: "Status",
          tabBarActiveTintColor: TabColors.status,
          tabBarIcon: ({ focused }) => (
            <Feather name="circle" size={22} color={focused ? TabColors.status : theme.tabIconDefault} />
          ),
        }}
      />
      <Tab.Screen
        name="LocationTab"
        component={LocationScreen}
        options={{
          title: "Location",
          tabBarActiveTintColor: TabColors.location,
          tabBarIcon: ({ focused }) => (
            <Feather name="map-pin" size={22} color={focused ? TabColors.location : theme.tabIconDefault} />
          ),
        }}
      />
      <Tab.Screen
        name="CallsTab"
        component={CallsScreen}
        options={{
          title: "Calls",
          tabBarActiveTintColor: TabColors.calls,
          tabBarIcon: ({ focused }) => (
            <Feather name="phone" size={22} color={focused ? TabColors.calls : theme.tabIconDefault} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: "Profile",
          tabBarActiveTintColor: TabColors.profile,
          tabBarIcon: ({ focused }) => (
            <Feather name="user" size={22} color={focused ? TabColors.profile : theme.tabIconDefault} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
