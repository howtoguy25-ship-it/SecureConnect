import React, { useState } from "react";
import { View, StyleSheet, Pressable, Alert, Platform, ActivityIndicator, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

interface BlockedUser {
  id: number;
  blockedAt: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    phoneNumber: string;
  };
}

const AVATAR_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"];

export default function BlockedContactsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const { data: blockedUsers = [], isLoading, isError, refetch } = useQuery<BlockedUser[]>({
    queryKey: ["/api/blocks"],
  });

  const unblockMutation = useMutation({
    mutationFn: (blockedUserId: string) => {
      return apiRequest("DELETE", `/api/blocks/${blockedUserId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      setUnblockingId(null);
    },
    onError: () => {
      setUnblockingId(null);
      if (Platform.OS === "web") {
        window.alert("Failed to unblock user. Please try again.");
      } else {
        Alert.alert("Error", "Failed to unblock user. Please try again.");
      }
    },
  });

  const handleUnblock = (user: BlockedUser["user"]) => {
    const doUnblock = () => {
      setUnblockingId(user.id);
      unblockMutation.mutate(user.id);
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Unblock ${user.displayName || user.phoneNumber}? They will be able to message and call you again.`)) {
        doUnblock();
      }
    } else {
      Alert.alert(
        "Unblock Contact",
        `Unblock ${user.displayName || user.phoneNumber}? They will be able to message and call you again.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Unblock", onPress: doUnblock },
        ]
      );
    }
  };

  const getAvatarColor = (id: string) => {
    return AVATAR_COLORS[Math.abs(id.charCodeAt(0)) % AVATAR_COLORS.length];
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const renderItem = ({ item }: { item: BlockedUser }) => {
    const isUnblocking = unblockingId === item.user.id;

    return (
      <View style={[styles.contactItem, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.contactLeft}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.user.id) }]}>
            <ThemedText type="body" style={styles.avatarText}>
              {(item.user.displayName || "?").charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.contactInfo}>
            <ThemedText type="body" style={{ fontWeight: "500" }}>
              {item.user.displayName || "Unknown"}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.user.phoneNumber}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 11 }}>
              Blocked {formatDate(item.blockedAt)}
            </ThemedText>
          </View>
        </View>

        <Pressable
          style={[styles.unblockButton, { backgroundColor: theme.primary }]}
          onPress={() => handleUnblock(item.user)}
          disabled={isUnblocking}
        >
          {isUnblocking ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText type="small" style={styles.unblockText}>Unblock</ThemedText>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {isLoading ? (
        <View style={[styles.emptyState, { paddingTop: headerHeight + Spacing["4xl"] }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : isError ? (
        <View style={[styles.emptyState, { paddingTop: headerHeight + Spacing["4xl"] }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="alert-circle" size={40} color={theme.error} />
          </View>
          <ThemedText type="h3" style={{ textAlign: "center" }}>
            Something Went Wrong
          </ThemedText>
          <ThemedText
            type="small"
            style={{ color: theme.textSecondary, textAlign: "center", maxWidth: 280, lineHeight: 18 }}
          >
            Could not load your blocked contacts. Please try again.
          </ThemedText>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={() => refetch()}
          >
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "600" }}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : blockedUsers.length === 0 ? (
        <View style={[styles.emptyState, { paddingTop: headerHeight + Spacing["4xl"] }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="user-check" size={40} color={theme.textSecondary} />
          </View>
          <ThemedText type="h3" style={{ textAlign: "center" }}>
            No Blocked Contacts
          </ThemedText>
          <ThemedText
            type="small"
            style={{ color: theme.textSecondary, textAlign: "center", maxWidth: 280, lineHeight: 18 }}
          >
            When you block someone, they will appear here. Blocked users cannot send you messages or call you.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
            paddingHorizontal: Spacing.lg,
            gap: Spacing.xs,
          }}
          ListHeaderComponent={
            <ThemedText type="small" style={[styles.headerNote, { color: theme.textSecondary }]}>
              Blocked contacts cannot send you messages or call you. Unblock them to restore communication.
            </ThemedText>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  headerNote: {
    marginBottom: Spacing.lg,
    lineHeight: 18,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  contactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 18,
  },
  contactInfo: {
    flex: 1,
    gap: 2,
  },
  unblockButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    minWidth: 80,
    alignItems: "center",
  },
  unblockText: {
    color: "#fff",
    fontWeight: "600",
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
  },
});
