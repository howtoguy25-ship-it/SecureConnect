import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { haptics } from "@/lib/haptics";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface FriendRequest {
  id: string;
  senderId: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export default function FriendRequestsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/friends/requests', baseUrl), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        setRequests(await response.json());
      }
    } catch (error) {
      console.error('Error fetching friend requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

  const handleAccept = async (request: FriendRequest) => {
    setBusyId(request.id);
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/friends/requests/${request.id}/accept`, baseUrl), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        haptics.success();
        setRequests(prev => prev.filter(r => r.id !== request.id));
      } else {
        Alert.alert('Error', 'Could not accept this request. Please try again.');
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      Alert.alert('Error', 'Could not accept this request. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = (requestId: string) => {
    Alert.alert(
      "Decline Request",
      "Are you sure you want to decline this friend request?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            setBusyId(requestId);
            try {
              const token = await getStoredToken();
              const baseUrl = getApiUrl();
              await fetch(new URL(`/api/friends/requests/${requestId}/decline`, baseUrl), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              haptics.warning();
              setRequests(prev => prev.filter(r => r.id !== requestId));
            } catch (error) {
              console.error('Error declining friend request:', error);
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const renderRequest = ({ item }: { item: FriendRequest }) => (
    <View style={[styles.requestCard, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.requestHeader}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Feather name="user" size={20} color="#fff" />
          )}
        </View>
        <View style={styles.requestInfo}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>
            {item.displayName || "Someone"}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {formatTime(item.createdAt)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.declineButton, { borderColor: theme.error }]}
          onPress={() => handleDecline(item.id)}
          disabled={busyId === item.id}
        >
          <ThemedText type="body" style={{ color: theme.error }}>
            Decline
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.acceptButton, { backgroundColor: theme.primary }]}
          onPress={() => handleAccept(item)}
          disabled={busyId === item.id}
        >
          {busyId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText type="body" style={{ color: "#fff" }}>
              Accept
            </ThemedText>
          )}
        </Pressable>
      </View>
    </View>
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Friend Requests",
    });
  }, [navigation]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={requests}
        renderItem={renderRequest}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="user-plus" size={48} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              No pending friend requests
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
              When someone sends you a friend request, it'll appear here
            </ThemedText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  requestCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 44,
    height: 44,
  },
  requestInfo: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  declineButton: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  acceptButton: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: Spacing["3xl"],
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
});
