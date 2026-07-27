import React, { useEffect, useState, useMemo } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert, TextInput } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { HeaderButton } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { haptics } from "@/lib/haptics";
import { encryptMessage as signalEncrypt, PreKeyBundle } from "@/utils/crypto/signalProtocol";
import { sendEncryptedToRecipient } from "@/lib/sealedSender";

type RouteProps = RouteProp<RootStackParamList, "ForwardPicker">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Conv {
  id: string;
  otherUserId: string;
  otherUserName: string;
  lastMessage?: string | null;
}

export default function ForwardPickerScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { messageId, plaintext, originalSenderId, mediaUrl, mediaType } = route.params;

  const [conversations, setConversations] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await getStoredToken();
        const res = await fetch(new URL("/api/conversations", getApiUrl()), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setConversations(
            (data || [])
              .filter((c: any) => c.otherUser?.id)
              .map((c: any) => ({
                id: c.id,
                otherUserId: c.otherUser.id,
                otherUserName: c.otherUser.displayName || "Chat",
                lastMessage: c.lastMessagePreview,
              }))
          );
        }
      } catch (e) {
        console.warn("forward picker load err", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => c.otherUserName.toLowerCase().includes(q));
  }, [conversations, search]);

  const toggle = (id: string) => {
    haptics.light();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchPreKeyBundle = async (token: string, userId: string): Promise<PreKeyBundle | null> => {
    try {
      const res = await fetch(
        new URL(`/api/e2ee/prekeys/bundle/${userId}`, getApiUrl()),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      return (await res.json()) as PreKeyBundle;
    } catch {
      return null;
    }
  };

  const sendForward = async () => {
    if (selected.size === 0) return;
    if (!plaintext && !mediaUrl) {
      Alert.alert("Cannot forward", "This message can't be forwarded from this device.");
      return;
    }
    setIsSending(true);
    try {
      const token = await getStoredToken();
      const targets = Array.from(selected)
        .map((cid) => conversations.find((c) => c.id === cid))
        .filter(Boolean) as Conv[];
      let okCount = 0;

      for (const t of targets) {
        try {
          // Re-encrypt the plaintext for THIS recipient using their preKey
          // bundle. Forwarded messages must never reuse the original
          // ciphertext, otherwise they cannot be decrypted in the new chat.
          const bundle = await fetchPreKeyBundle(token, t.otherUserId);
          if (!bundle) continue;

          const enc = await signalEncrypt(
            user?.id ?? "",
            t.otherUserId,
            plaintext ?? "",
            bundle
          );

          // Item 4a — route through the shared sealed/legacy helper so a
          // forwarded message from a sealed-mode sender no longer carries
          // the sender's userId on the row. The helper returns
          // `failureReason: "capability-unknown"` if we can't confirm the
          // recipient supports sealed — in that case we MUST NOT silently
          // fall back to legacy (that would re-introduce the leak), so we
          // count it as a failed target and surface the partial-failure
          // total to the user.
          const result = await sendEncryptedToRecipient({
            currentUser: user,
            conversationId: t.id,
            receiverId: t.otherUserId,
            ciphertext: enc.ciphertext,
            encryptionVersion: enc.encryptionVersion,
            e2eeInitEnvelope: enc.e2eeInitEnvelope,
            legacyMediaUrl: mediaUrl ?? null,
            legacyMediaType: mediaType ?? null,
            forwarded: true,
            forwardedFromUserId: originalSenderId,
          });
          if (result.ok) okCount++;
        } catch (perTargetErr) {
          console.error("forward per-target err", perTargetErr);
        }
      }

      haptics.success();
      Alert.alert(
        "Forwarded",
        `Sent to ${okCount} of ${targets.length} chat${targets.length === 1 ? "" : "s"}.`
      );
      navigation.goBack();
    } catch (e) {
      console.error("forward err", e);
      Alert.alert("Error", "Failed to forward message.");
    } finally {
      setIsSending(false);
    }
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton onPress={sendForward} disabled={selected.size === 0 || isSending}>
          <ThemedText
            type="body"
            style={{
              color: selected.size === 0 ? theme.textSecondary : theme.primary,
              fontWeight: "600",
            }}
          >
            {isSending ? "Sending…" : `Send (${selected.size})`}
          </ThemedText>
        </HeaderButton>
      ),
    });
  }, [navigation, selected.size, isSending, theme]);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundRoot,
          paddingTop: headerHeight + Spacing.md,
        },
      ]}
    >
      <View
        style={[styles.searchBox, { backgroundColor: theme.backgroundSecondary }]}
      >
        <Feather name="search" size={18} color={theme.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search chats"
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        ListEmptyComponent={
          <View style={styles.center}>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              No chats found.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => {
          const isSel = selected.has(item.id);
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              style={[styles.row, { borderBottomColor: theme.border }]}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: theme.primary },
                ]}
              >
                <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                  {item.otherUserName.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {item.otherUserName}
                </ThemedText>
                {item.lastMessage ? (
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary }}
                    numberOfLines={1}
                  >
                    {item.lastMessage}
                  </ThemedText>
                ) : null}
              </View>
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: isSel ? theme.primary : theme.border,
                    backgroundColor: isSel ? theme.primary : "transparent",
                  },
                ]}
              >
                {isSel ? <Feather name="check" size={16} color="#fff" /> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
