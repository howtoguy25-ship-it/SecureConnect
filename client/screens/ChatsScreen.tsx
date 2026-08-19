import React, { useState, useCallback, useRef, memo, useEffect } from "react";
import { View, StyleSheet, FlatList, ScrollView, Pressable, RefreshControl, Platform, Alert, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { HeaderTitle } from "@/components/HeaderTitle";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { ChatItemSkeleton } from "@/components/Skeleton";
import { AdBanner } from "@/components/AdBanner";
import { getSocket } from "@/lib/socket";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

interface Conversation {
  id: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  otherUser: {
    id: string;
    displayName: string;
    avatarIndex: number;
    isVip: boolean;
  } | null;
  unreadCount: number;
  isArchived?: boolean;
  isMuted?: boolean;
  folder?: string;
  isPendingRequest?: boolean;
}

type ChatFolder = "all" | "randoms" | "friends" | "family";

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "Now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return date.toLocaleDateString();
};

const ConversationItem = memo(({ item, onPress, onLongPress, isTyping, theme }: { item: Conversation; onPress: () => void; onLongPress: () => void; isTyping: boolean; theme: any }) => {
  if (!item.otherUser) return null;

  return (
    <AnimatedPressable
      style={[styles.conversationItem, { borderBottomColor: theme.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      scaleValue={0.98}
    >
      <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.otherUser.avatarIndex || 0] }]}>
        <Feather name="user" size={26} color="#fff" />
      </View>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <View style={styles.nameContainer}>
            <ThemedText type="body" style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {item.otherUser.displayName || "User"}
            </ThemedText>
            {item.otherUser.isVip ? (
              <Feather name="award" size={14} color={theme.accent} />
            ) : null}
            {item.isMuted ? (
              <Feather name="bell-off" size={13} color={theme.textSecondary} />
            ) : null}
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {formatTime(item.lastMessageAt)}
          </ThemedText>
        </View>

        <View style={styles.previewContainer}>
          <View style={styles.previewWithLock}>
            {isTyping ? (
              <ThemedText
                type="small"
                style={[styles.preview, { color: theme.primary, fontStyle: "italic" }]}
                numberOfLines={1}
              >
                typing…
              </ThemedText>
            ) : item.isPendingRequest ? (
              <>
                <Feather name="user-plus" size={12} color={theme.primary} style={styles.lockIcon} />
                <ThemedText
                  type="small"
                  style={[styles.preview, { color: theme.primary, fontWeight: "600" }]}
                  numberOfLines={1}
                >
                  Message request
                </ThemedText>
              </>
            ) : (
              <>
                <Feather name="lock" size={12} color={theme.textSecondary} style={styles.lockIcon} />
                <ThemedText
                  type="small"
                  style={[styles.preview, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.lastMessagePreview || "No messages yet"}
                </ThemedText>
              </>
            )}
          </View>
          {item.unreadCount > 0 ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.unreadBadge, { backgroundColor: theme.primary }]}
            >
              <ThemedText type="small" style={styles.unreadText}>
                {item.unreadCount}
              </ThemedText>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
});
ConversationItem.displayName = "ConversationItem";

export default function ChatsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user } = useAuth();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { numberMode, setNumberMode } = useAuth();
  const [activeFolder, setActiveFolder] = useState<ChatFolder>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [typingByConv, setTypingByConv] = useState<Record<string, number>>({});
  const [actionSheetConv, setActionSheetConv] = useState<Conversation | null>(null);
  // Mirrors user.keepMutedChatsArchived for the mute-toggle's optimistic
  // update (below) without adding it to that callback's dependency array.
  const keepMutedArchivedRef = useRef(!!user?.keepMutedChatsArchived);
  useEffect(() => {
    keepMutedArchivedRef.current = !!user?.keepMutedChatsArchived;
  }, [user?.keepMutedChatsArchived]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onTyping = (data: { conversationId: string; userId: string }) => {
      if (!data?.conversationId || data.userId === user?.id) return;
      setTypingByConv((prev) => ({ ...prev, [data.conversationId]: Date.now() }));
    };
    const onStop = (data: { conversationId: string; userId: string }) => {
      if (!data?.conversationId || data.userId === user?.id) return;
      setTypingByConv((prev) => {
        const next = { ...prev };
        delete next[data.conversationId];
        return next;
      });
    };
    socket.on("user-typing", onTyping);
    socket.on("user-stop-typing", onStop);
    const sweep = setInterval(() => {
      const cutoff = Date.now() - 4000;
      setTypingByConv((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v > cutoff) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => {
      socket.off("user-typing", onTyping);
      socket.off("user-stop-typing", onStop);
      clearInterval(sweep);
    };
  }, [user?.id]);

  const filteredConversations = conversations.filter((conv) => {
    if (showArchived) return conv.isArchived === true;
    if (conv.isArchived) return false;
    if (showUnreadOnly && conv.unreadCount <= 0) return false;
    if (activeFolder === "all") return true;
    return conv.folder === activeFolder;
  });

  const unreadTotal = conversations.filter((c) => !c.isArchived && c.unreadCount > 0).length;

  const archivedCount = conversations.filter((c) => c.isArchived).length;

  // Hide the floating "compose" button only on the true empty welcome state —
  // i.e. user has zero conversations at all (not just an empty filter view).
  // The welcome state already has a primary "Start your first secure chat" CTA,
  // and the FAB would visually collide with it on smaller phones.
  const showFab = !isLoading && conversations.length > 0;

  const fetchConversations = async () => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      // Include numberType to filter conversations by personal/virtual mode
      const url = new URL('/api/conversations', baseUrl);
      url.searchParams.set('numberType', numberMode);
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Refetch on screen focus (initial load and returning to screen)
  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [])
  );

  // Also refetch when numberMode changes while on screen
  useEffect(() => {
    setIsLoading(true);
    fetchConversations();
  }, [numberMode]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchConversations();
  };

  const handleToggleMute = useCallback(async (conv: Conversation) => {
    const nextMuted = !conv.isMuted;
    // Optimistic update so the row/icon flips instantly; reconciled by the
    // next fetchConversations() (focus/refresh) if the request fails.
    setConversations((prev) => prev.map((c) => (
      c.id === conv.id
        ? { ...c, isMuted: nextMuted, isArchived: nextMuted && keepMutedArchivedRef.current ? true : c.isArchived }
        : c
    )));
    try {
      await apiRequest("POST", `/api/conversations/${conv.id}/${nextMuted ? "mute" : "unmute"}`);
    } catch (error) {
      console.error("Error toggling mute:", error);
      // Revert on failure.
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, isMuted: conv.isMuted } : c)));
      Alert.alert("Error", "Couldn't update mute setting. Please try again.");
    }
  }, []);

  const handleToggleArchive = useCallback(async (conv: Conversation) => {
    const nextArchived = !conv.isArchived;
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, isArchived: nextArchived } : c)));
    try {
      await apiRequest("POST", `/api/conversations/${conv.id}/${nextArchived ? "archive" : "unarchive"}`);
    } catch (error) {
      console.error("Error toggling archive:", error);
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, isArchived: conv.isArchived } : c)));
      Alert.alert("Error", "Couldn't update archive setting. Please try again.");
    }
  }, []);

  const handleLongPressConversation = useCallback((conv: Conversation) => {
    setActionSheetConv(conv);
  }, []);

  const renderConversation = useCallback(({ item }: { item: Conversation }) => (
    <ConversationItem
      item={item}
      isTyping={!!typingByConv[item.id]}
      theme={theme}
      onPress={() => navigation.navigate("Conversation", {
        conversationId: item.id,
        otherUserId: item.otherUser!.id,
        otherUserName: item.otherUser!.displayName || "User",
      })}
      onLongPress={() => handleLongPressConversation(item)}
    />
  ), [navigation, typingByConv, theme, handleLongPressConversation]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title="Pryvo Messenger" />,
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.navigate("VipUpgrade")}
          style={styles.headerButton}
        >
          <Feather name="menu" size={24} color={theme.text} />
        </Pressable>
      ),
    });
  }, [navigation, theme]);

  const toggleTopOffset = Math.max(headerHeight, insets.top + 48) + Spacing.sm;
  
  const FolderTabs = () => (
    <View style={[styles.folderTabsContainer, { marginTop: toggleTopOffset }]}>
      {showArchived ? (
        <Pressable style={styles.backToChats} onPress={() => setShowArchived(false)}>
          <Feather name="arrow-left" size={18} color={theme.primary} />
          <ThemedText style={{ color: theme.primary, marginLeft: Spacing.xs }}>Back to Chats</ThemedText>
        </Pressable>
      ) : (
        <>
          <View style={styles.filterRow}>
            <View style={[styles.folderTabs, { backgroundColor: theme.backgroundDefault }]}>
              {(["all", "randoms", "friends", "family"] as ChatFolder[]).map((folder) => (
                <Pressable
                  key={folder}
                  style={[styles.folderTab, activeFolder === folder && { backgroundColor: theme.primary }]}
                  onPress={() => setActiveFolder(folder)}
                >
                  <ThemedText
                    style={[styles.folderTabText, { color: activeFolder === folder ? "#fff" : theme.textSecondary }]}
                  >
                    {folder === "all" ? "All" : folder.charAt(0).toUpperCase() + folder.slice(1)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[
                styles.unreadFilterPill,
                { backgroundColor: showUnreadOnly ? theme.primary : theme.backgroundDefault },
              ]}
              onPress={() => setShowUnreadOnly((prev) => !prev)}
            >
              <Feather name="circle" size={9} color={showUnreadOnly ? "#fff" : theme.primary} />
              <ThemedText
                type="small"
                style={{ color: showUnreadOnly ? "#fff" : theme.textSecondary, marginLeft: 4, fontWeight: "600" }}
              >
                Unread{unreadTotal > 0 ? ` (${unreadTotal})` : ""}
              </ThemedText>
            </Pressable>
          </View>
          {archivedCount > 0 && (
            <Pressable style={styles.archivedButton} onPress={() => setShowArchived(true)}>
              <Feather name="archive" size={16} color={theme.textSecondary} />
              <ThemedText style={{ color: theme.textSecondary, marginLeft: Spacing.xs }}>
                Archived ({archivedCount})
              </ThemedText>
            </Pressable>
          )}
        </>
      )}
    </View>
  );

  // Re-derive from live state so the sheet's labels ("Mute" ↔ "Unmute")
  // flip immediately if the user reopens it after toggling, without a stale
  // captured snapshot.
  const sheetConv = actionSheetConv
    ? conversations.find((c) => c.id === actionSheetConv.id) ?? actionSheetConv
    : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FolderTabs />
      
      {isLoading ? (
        <View style={{ flex: 1, paddingTop: Spacing.lg }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <ChatItemSkeleton key={i} />
          ))}
        </View>
      ) : filteredConversations.length === 0 && numberMode === 'virtual' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.emptyContainer, { paddingBottom: insets.bottom + 16 }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
          }
        >
          <Feather name="message-circle" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            No virtual number chats yet
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: 'center' }}>
            Start a new encrypted chat using your virtual number
          </ThemedText>
        </ScrollView>
      ) : filteredConversations.length === 0 && showArchived ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.emptyContainer, { paddingBottom: insets.bottom + 16 }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
          }
        >
          <Feather name="archive" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            No archived chats
          </ThemedText>
        </ScrollView>
      ) : filteredConversations.length === 0 && showUnreadOnly ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.emptyContainer, { paddingBottom: insets.bottom + 16 }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
          }
        >
          <Feather name="check-circle" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            All caught up
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: 'center' }}>
            No unread chats right now
          </ThemedText>
        </ScrollView>
      ) : filteredConversations.length === 0 && numberMode !== 'virtual' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 16 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.welcomeWrapper}>
            <LinearGradient
              colors={[theme.primary + '18', theme.accent + '10', 'transparent']}
              style={styles.welcomeGradient}
            >
              <View style={[styles.welcomeIconRing, { borderColor: theme.primary + '30', backgroundColor: theme.primary + '12' }]}>
                <Feather name="shield" size={40} color={theme.primary} />
              </View>
              <ThemedText type="h2" style={styles.welcomeTitle}>
                Welcome to Pryvo
              </ThemedText>
              <ThemedText type="body" style={[styles.welcomeTagline, { color: theme.primary }]}>
                Where chats are encrypted & secure
              </ThemedText>
              <ThemedText type="small" style={[styles.welcomeBody, { color: theme.textSecondary }]}>
                Every message you send is protected with end-to-end encryption using the Signal Protocol. No one — not even us — can read your conversations.
              </ThemedText>

              <View style={styles.welcomeFeatures}>
                {[
                  { icon: "lock" as const, label: "End-to-End Encrypted" },
                  { icon: "eye-off" as const, label: "Zero Knowledge" },
                  { icon: "zap" as const, label: "Real-Time Messaging" },
                ].map((f) => (
                  <View key={f.label} style={[styles.welcomeFeatureChip, { backgroundColor: theme.backgroundDefault }]}>
                    <Feather name={f.icon} size={13} color={theme.primary} />
                    <ThemedText type="small" style={[styles.welcomeFeatureText, { color: theme.text }]}>
                      {f.label}
                    </ThemedText>
                  </View>
                ))}
              </View>

              <Pressable
                style={[styles.welcomeCta, { backgroundColor: theme.primary }]}
                onPress={() => navigation.navigate("NewMessage")}
              >
                <Feather name="edit-2" size={16} color="#fff" />
                <ThemedText type="body" style={styles.welcomeCtaText}>
                  Start your first secure chat
                </ThemedText>
              </Pressable>
            </LinearGradient>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={filteredConversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: Spacing.md,
            paddingBottom: insets.bottom + 80,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
            />
          }
        />
      )}
      
      {showFab ? (
        <AnimatedPressable
          style={[
            styles.fab,
            {
              backgroundColor: theme.primary,
              bottom: insets.bottom + 80,
            },
          ]}
          onPress={() => navigation.navigate("NewMessage")}
          scaleValue={0.9}
          hapticType="medium"
        >
          <Feather name="edit" size={24} color="#fff" />
        </AnimatedPressable>
      ) : null}

      <AdBanner />

      <Modal
        visible={!!sheetConv}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetConv(null)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setActionSheetConv(null)}
        >
          <Pressable
            style={[
              styles.sheetCard,
              { backgroundColor: theme.backgroundTertiary, paddingBottom: insets.bottom + Spacing.md },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <ThemedText type="body" style={styles.sheetTitle} numberOfLines={1}>
              {sheetConv?.otherUser?.displayName || "Chat"}
            </ThemedText>

            {sheetConv ? (
              <>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    handleToggleMute(sheetConv);
                    setActionSheetConv(null);
                  }}
                >
                  <View style={[styles.sheetIconBg, { backgroundColor: theme.primary }]}>
                    <Feather name={sheetConv.isMuted ? "bell" : "bell-off"} size={16} color="#fff" />
                  </View>
                  <ThemedText type="body">{sheetConv.isMuted ? "Unmute Chat" : "Mute Chat"}</ThemedText>
                </Pressable>

                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    handleToggleArchive(sheetConv);
                    setActionSheetConv(null);
                  }}
                >
                  <View style={[styles.sheetIconBg, { backgroundColor: theme.accent }]}>
                    <Feather name={sheetConv.isArchived ? "arrow-up-circle" : "archive"} size={16} color="#fff" />
                  </View>
                  <ThemedText type="body">{sheetConv.isArchived ? "Unarchive Chat" : "Archive Chat"}</ThemedText>
                </Pressable>
              </>
            ) : null}

            <Pressable
              style={[styles.sheetCancel, { borderColor: theme.border }]}
              onPress={() => setActionSheetConv(null)}
            >
              <ThemedText type="body" style={{ color: theme.textSecondary, fontWeight: "600" }}>
                Cancel
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
    flexShrink: 1,
  },
  name: {
    fontWeight: "600",
    fontSize: 17,
  },
  previewContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewWithLock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  lockIcon: {
    marginRight: Spacing.xs,
  },
  preview: {
    flex: 1,
    fontSize: 15,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
  },
  unreadText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
    gap: Spacing.md,
  },
  emptyText: {
    marginTop: Spacing.sm,
  },
  welcomeWrapper: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing["2xl"],
    paddingBottom: Spacing.xl,
  },
  welcomeGradient: {
    borderRadius: BorderRadius.xl,
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  welcomeIconRing: {
    width: 88,
    height: 88,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  welcomeTitle: {
    textAlign: "center",
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  welcomeTagline: {
    textAlign: "center",
    fontWeight: "600",
    fontSize: 16,
    marginBottom: Spacing.lg,
  },
  welcomeBody: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  welcomeFeatures: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  welcomeFeatureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  welcomeFeatureText: {
    fontWeight: "500",
  },
  welcomeCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  welcomeCtaText: {
    color: "#fff",
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  modeToggleContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  modeToggleWrapper: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    padding: 3,
    alignSelf: "center",
  },
  modeToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: "500",
  },
  folderTabsContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  folderTabs: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  unreadFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  folderTab: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  folderTabText: {
    fontSize: 13,
    fontWeight: "500",
  },
  archivedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  backToChats: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetCard: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.4)",
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontWeight: "700",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  sheetIconBg: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetCancel: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
});
