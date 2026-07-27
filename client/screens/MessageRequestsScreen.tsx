import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { haptics } from "@/lib/haptics";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

interface MessageRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarIndex: number;
  messagePreview: string | null;
  createdAt: string;
  conversationId: string | null;
}

type MessageRequestSetting = "everyone" | "contacts_only";

export default function MessageRequestsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [setting, setSetting] = useState<MessageRequestSetting>("everyone");

  const fetchRequests = async () => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/message-requests', baseUrl), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
        setSetting(data.setting || "everyone");
      }
    } catch (error) {
      console.error('Error fetching message requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

  const handleUpdateSetting = async (newSetting: MessageRequestSetting) => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      await fetch(new URL('/api/message-requests/settings', baseUrl), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ setting: newSetting }),
      });
      setSetting(newSetting);
      haptics.success();
    } catch (error) {
      console.error('Error updating setting:', error);
    }
  };

  const handleAcceptRequest = async (request: MessageRequest) => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/message-requests/${request.id}/accept`, baseUrl), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        haptics.success();
        setRequests(prev => prev.filter(r => r.id !== request.id));
        
        if (data.conversationId) {
          navigation.navigate("Conversation", {
            conversationId: data.conversationId,
            otherUserId: request.senderId,
            otherUserName: request.senderName,
          });
        }
      }
    } catch (error) {
      console.error('Error accepting request:', error);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    Alert.alert(
      "Decline Request",
      "Are you sure you want to decline this message request?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getStoredToken();
              const baseUrl = getApiUrl();
              await fetch(new URL(`/api/message-requests/${requestId}/decline`, baseUrl), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              haptics.warning();
              setRequests(prev => prev.filter(r => r.id !== requestId));
            } catch (error) {
              console.error('Error declining request:', error);
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

  const renderRequest = ({ item }: { item: MessageRequest }) => (
    <View style={[styles.requestCard, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.requestHeader}>
        <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.senderAvatarIndex || 0] }]}>
          <Feather name="user" size={20} color="#fff" />
        </View>
        <View style={styles.requestInfo}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>
            {item.senderName}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {formatTime(item.createdAt)}
          </ThemedText>
        </View>
      </View>
      
      {item.messagePreview ? (
        <ThemedText type="body" style={styles.preview} numberOfLines={2}>
          {item.messagePreview}
        </ThemedText>
      ) : null}
      
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.declineButton, { borderColor: theme.error }]}
          onPress={() => handleDeclineRequest(item.id)}
        >
          <ThemedText type="body" style={{ color: theme.error }}>
            Decline
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.acceptButton, { backgroundColor: theme.primary }]}
          onPress={() => handleAcceptRequest(item)}
        >
          <ThemedText type="body" style={{ color: "#fff" }}>
            Accept
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Message Requests",
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
      <View style={[styles.settingsSection, { paddingTop: headerHeight + Spacing.lg }]}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          WHO CAN SEND YOU MESSAGE REQUESTS
        </ThemedText>
        
        <Pressable
          style={[
            styles.optionItem,
            { backgroundColor: theme.backgroundDefault },
            setting === "everyone" && { borderColor: theme.primary, borderWidth: 2 },
          ]}
          onPress={() => handleUpdateSetting("everyone")}
        >
          <View style={[styles.optionIcon, { backgroundColor: theme.primary + "1A" }]}>
            <Feather name="globe" size={18} color={setting === "everyone" ? theme.primary : theme.text} />
          </View>
          <View style={styles.optionTextWrap}>
            <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
              Everyone
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={2}>
              Anyone can send you message requests
            </ThemedText>
          </View>
          <View style={styles.optionCheck}>
            {setting === "everyone" ? (
              <Feather name="check-circle" size={22} color={theme.primary} />
            ) : (
              <View style={[styles.checkPlaceholder, { borderColor: theme.border }]} />
            )}
          </View>
        </Pressable>

        <Pressable
          style={[
            styles.optionItem,
            { backgroundColor: theme.backgroundDefault },
            setting === "contacts_only" && { borderColor: theme.primary, borderWidth: 2 },
          ]}
          onPress={() => handleUpdateSetting("contacts_only")}
        >
          <View style={[styles.optionIcon, { backgroundColor: theme.primary + "1A" }]}>
            <Feather name="users" size={18} color={setting === "contacts_only" ? theme.primary : theme.text} />
          </View>
          <View style={styles.optionTextWrap}>
            <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
              Contacts Only
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={2}>
              Only people in your conversations can message
            </ThemedText>
          </View>
          <View style={styles.optionCheck}>
            {setting === "contacts_only" ? (
              <Feather name="check-circle" size={22} color={theme.primary} />
            ) : (
              <View style={[styles.checkPlaceholder, { borderColor: theme.border }]} />
            )}
          </View>
        </Pressable>
      </View>

      <View style={styles.requestsSection}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          PENDING REQUESTS ({requests.length})
        </ThemedText>
        
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="inbox" size={48} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                No pending requests
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
                When someone new tries to message you, their request will appear here
              </ThemedText>
            </View>
          }
        />
      </View>
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
  settingsSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    fontWeight: "600",
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    minHeight: 64,
    gap: Spacing.md,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  optionTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  optionCheck: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: Spacing.sm,
  },
  checkPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  requestsSection: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
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
  },
  requestInfo: {
    flex: 1,
  },
  preview: {
    marginBottom: Spacing.md,
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
