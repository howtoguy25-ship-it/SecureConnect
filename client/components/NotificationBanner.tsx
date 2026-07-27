import React, { useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Animated, Platform, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { haptics } from "@/lib/haptics";

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  conversationId?: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string | null;
  type?: string;
}

interface NotificationBannerProps {
  notification: InAppNotification | null;
  onDismiss: () => void;
}

export function NotificationBanner({ notification, onDismiss }: NotificationBannerProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const translateY = useRef(new Animated.Value(-150)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (notification) {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      haptics.light();

      dismissTimer.current = setTimeout(() => {
        dismiss();
      }, 4000);
    }

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, [notification?.id]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -150,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [onDismiss]);

  const handlePress = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    if (notification?.conversationId && notification?.senderId) {
      navigation.navigate("Conversation", {
        conversationId: notification.conversationId,
        otherUserId: notification.senderId,
        otherUserName: notification.senderName || "Chat",
      });
    }

    dismiss();
  }, [notification, navigation, dismiss]);

  if (!notification) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + Spacing.xs,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[styles.banner, { backgroundColor: theme.backgroundDefault }]}
        onPress={handlePress}
      >
        <View style={[styles.avatarContainer, { backgroundColor: theme.primary }]}>
          {notification.senderAvatar ? (
            <Image source={{ uri: notification.senderAvatar }} style={styles.avatar} />
          ) : (
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
              {notification.senderName?.charAt(0) || "?"}
            </ThemedText>
          )}
        </View>

        <View style={styles.textContainer}>
          <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
            {notification.title}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={2}>
            {notification.body}
          </ThemedText>
        </View>

        <Pressable style={styles.dismissButton} onPress={dismiss} hitSlop={8}>
          <Feather name="x" size={18} color={theme.textSecondary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
});
