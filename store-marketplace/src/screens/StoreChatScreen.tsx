import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { watchBusiness } from "@/services/businesses";
import { getMembership } from "@/services/membership";
import { watchFollow } from "@/services/follows";
import { sendChatMessage, deleteChatMessage, watchChatMessages } from "@/services/chat";
import type { Business, ChatMessage, Membership } from "@/types";

type Props = NativeStackScreenProps<RootStackParamList, "StoreChat">;

export function StoreChatScreen({ route, navigation }: Props) {
  const { businessId } = route.params;
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = watchBusiness(businessId, (b) => {
      setBusiness(b);
      navigation.setOptions({ title: b ? `${b.name} chat` : "Chat" });
    });
    return unsub;
  }, [businessId]);
  useEffect(() => watchChatMessages(businessId, setMessages), [businessId]);
  useEffect(() => {
    if (!user) return;
    getMembership(businessId, user.uid).then(setMembership);
    return watchFollow(user.uid, businessId, (f) => setIsFollowing(!!f));
  }, [user, businessId]);

  const isTeamMember = membership?.status === "active";
  const canManageTeam = membership?.permissions.canManageTeam ?? false;
  const canPost = !!business?.chatEnabled && (isTeamMember || isFollowing);

  async function handleSend() {
    if (!user || !text.trim()) return;
    setSending(true);
    try {
      await sendChatMessage(businessId, {
        senderId: user.uid,
        senderName: user.displayName || "Anonymous",
        isStaff: isTeamMember,
        text: text.trim(),
      });
      setText("");
    } catch (err) {
      Alert.alert("Couldn't send message", err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function handleLongPress(message: ChatMessage) {
    const canDelete = canManageTeam || message.senderId === user?.uid;
    if (!canDelete) return;
    Alert.alert("Delete message?", message.text, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteChatMessage(businessId, message.id) },
    ]);
  }

  if (!business) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} color="#4F46E5" />
      </View>
    );
  }

  if (!business.chatEnabled) {
    return (
      <View style={styles.container}>
        <Text style={styles.notice}>This store hasn't turned on chat.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.7} onLongPress={() => handleLongPress(item)} style={styles.messageRow}>
            <View style={styles.messageHeader}>
              <Text style={styles.sender}>{item.senderName}</Text>
              {item.isStaff && (
                <View style={styles.staffBadge}>
                  <Text style={styles.staffBadgeText}>Store</Text>
                </View>
              )}
            </View>
            <Text style={styles.messageText}>{item.text}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.notice}>No messages yet -- say hello.</Text>}
      />

      {canPost ? (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message this store..."
            placeholderTextColor="#6B7280"
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !text.trim()}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.followNotice}>
          {isTeamMember ? "" : "Follow this store to join the chat."}
        </Text>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  listContent: { padding: 16, flexGrow: 1 },
  notice: { color: "#6B7280", textAlign: "center", marginTop: 40 },
  messageRow: { marginBottom: 14 },
  messageHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  sender: { color: "#818CF8", fontSize: 12, fontWeight: "600" },
  staffBadge: { backgroundColor: "#4F46E5", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  staffBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  messageText: { color: "#E5E7EB", fontSize: 14 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
  },
  input: {
    flex: 1,
    backgroundColor: "#1F2937",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#4F46E5",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  followNotice: { color: "#6B7280", fontSize: 12, textAlign: "center", padding: 16 },
});
