import React, { useEffect } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = BorderRadius.sm,
  style,
}: SkeletonProps) {
  const { theme } = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: theme.backgroundTertiary,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function ChatItemSkeleton() {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.chatItem, { borderBottomColor: theme.border }]}>
      <Skeleton width={52} height={52} borderRadius={26} />
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Skeleton width={120} height={18} />
          <Skeleton width={40} height={14} />
        </View>
        <Skeleton width="80%" height={14} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function CallItemSkeleton() {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.callItem, { borderBottomColor: theme.border }]}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={styles.callContent}>
        <Skeleton width={100} height={18} />
        <View style={styles.callMeta}>
          <Skeleton width={16} height={16} borderRadius={8} />
          <Skeleton width={80} height={14} style={{ marginLeft: 6 }} />
        </View>
      </View>
      <Skeleton width={32} height={32} borderRadius={16} />
    </View>
  );
}

export function StatusItemSkeleton() {
  return (
    <View style={styles.statusItem}>
      <View style={styles.statusRing}>
        <Skeleton width={64} height={64} borderRadius={32} />
      </View>
      <Skeleton width={60} height={12} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
  },
  chatContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  callItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
  },
  callContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  callMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  statusItem: {
    alignItems: "center",
    marginRight: Spacing.lg,
  },
  statusRing: {
    padding: 3,
  },
});
