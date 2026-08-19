import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Swipeable } from "react-native-gesture-handler";
import { ThemedText } from "@/components/ThemedText";
import { PinPad } from "@/components/PinPad";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { apiRequest } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type LockedChatsRouteProp = RouteProp<RootStackParamList, "LockedChats">;

const AVATAR_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"];
const MIN_PIN_LENGTH = 4;

interface LockedConversation {
  id: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  otherUser: { id: string; displayName: string; avatarIndex: number } | null;
}

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

type Phase = "loading" | "setup" | "setupConfirm" | "verify" | "unlocked" | "changeCurrent" | "changeNew" | "changeConfirm";

export default function LockedChatsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<LockedChatsRouteProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const lockConversationId = route.params?.lockConversationId;

  const [phase, setPhase] = useState<Phase>("loading");
  const [pinInput, setPinInput] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [conversations, setConversations] = useState<LockedConversation[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const res = await apiRequest("GET", "/api/chat-lock/has-pin");
          const data = await res.json();
          if (cancelled) return;
          setPinInput("");
          setError(null);
          setPhase(data.hasPin ? "verify" : "setup");
        } catch {
          if (!cancelled) setPhase("verify");
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const fetchLockedConversations = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await apiRequest("GET", "/api/conversations");
      const data = await res.json();
      setConversations((data as any[]).filter((c) => c.isLocked));
    } catch (e) {
      console.error("Error fetching locked conversations:", e);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const lockPendingConversation = useCallback(async () => {
    if (!lockConversationId) return;
    try {
      await apiRequest("POST", `/api/conversations/${lockConversationId}/lock`);
      showAlert("Chat Locked", "This chat has been moved to Locked Chats.");
    } catch {
      showAlert("Error", "Couldn't lock this chat. Please try again.");
    }
  }, [lockConversationId]);

  const enterUnlocked = useCallback(async () => {
    if (lockConversationId) {
      await lockPendingConversation();
      navigation.goBack();
      return;
    }
    setPhase("unlocked");
    fetchLockedConversations();
  }, [lockConversationId, lockPendingConversation, navigation, fetchLockedConversations]);

  const handleVerify = async (pin: string) => {
    if (isBusy || lockoutSeconds > 0) return;
    setIsBusy(true);
    try {
      const res = await apiRequest("POST", "/api/chat-lock/verify-pin", { pin });
      const data = await res.json();
      if (data.valid) {
        await enterUnlocked();
        return;
      }
      if (data.lockedUntil) {
        const remaining = Math.max(0, Math.ceil((new Date(data.lockedUntil).getTime() - Date.now()) / 1000));
        setLockoutSeconds(remaining);
        setError("Too many attempts. Try again shortly.");
      } else {
        setError("Incorrect PIN");
      }
      setPinInput("");
    } catch {
      setError("Couldn't verify PIN. Please try again.");
      setPinInput("");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const t = setInterval(() => setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1)), 1000);
    return () => clearInterval(t);
  }, [lockoutSeconds > 0]);

  const handleSetupFirst = (pin: string) => {
    if (pin.length < MIN_PIN_LENGTH) {
      setError(`Must be at least ${MIN_PIN_LENGTH} digits`);
      return;
    }
    setFirstPin(pin);
    setPinInput("");
    setError(null);
    setPhase("setupConfirm");
  };

  const handleSetupConfirm = async (pin: string) => {
    if (pin !== firstPin) {
      setError("PINs don't match. Try again.");
      setFirstPin("");
      setPinInput("");
      setPhase("setup");
      return;
    }
    setIsBusy(true);
    try {
      await apiRequest("POST", "/api/chat-lock/pin", { pin });
      await enterUnlocked();
    } catch {
      showAlert("Error", "Couldn't set up your PIN. Please try again.");
      setPhase("setup");
      setPinInput("");
    } finally {
      setIsBusy(false);
    }
  };

  const handleChangeCurrent = async (pin: string) => {
    setCurrentPinInput(pin);
    setPinInput("");
    setFirstPin("");
    setError(null);
    setPhase("changeNew");
  };

  const handleChangeNewFirst = (pin: string) => {
    if (pin.length < MIN_PIN_LENGTH) {
      setError(`Must be at least ${MIN_PIN_LENGTH} digits`);
      return;
    }
    setFirstPin(pin);
    setPinInput("");
    setError(null);
    setPhase("changeConfirm");
  };

  const handleChangeConfirm = async (pin: string) => {
    if (pin !== firstPin) {
      setError("PINs don't match. Try again.");
      setFirstPin("");
      setPinInput("");
      setPhase("changeNew");
      return;
    }
    setIsBusy(true);
    try {
      const res = await apiRequest("POST", "/api/chat-lock/change-pin", { currentPin: currentPinInput, newPin: pin });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showAlert("Error", data.error || "Couldn't change your PIN.");
        setPhase("unlocked");
        return;
      }
      showAlert("PIN Changed", "Your Locked Chats PIN has been updated.");
      setPhase("unlocked");
    } catch {
      showAlert("Error", "Couldn't change your PIN. Please try again.");
      setPhase("unlocked");
    } finally {
      setIsBusy(false);
      setPinInput("");
    }
  };

  const handleUnlockChat = async (conv: LockedConversation) => {
    setConversations((prev) => prev.filter((c) => c.id !== conv.id));
    try {
      await apiRequest("POST", `/api/conversations/${conv.id}/unlock`);
    } catch {
      showAlert("Error", "Couldn't unlock this chat. Please try again.");
      fetchLockedConversations();
    }
  };

  const renderPinStep = (
    title: string,
    subtitle: string,
    onDone: (pin: string) => void,
    doneLabel = "Continue"
  ) => (
    <View style={styles.centerStep}>
      <ThemedText type="h2" style={{ fontWeight: "700", marginBottom: Spacing.xs }}>
        {title}
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xl, textAlign: "center" }}>
        {subtitle}
      </ThemedText>
      <PinPad value={pinInput} onChange={(v) => { setError(null); setPinInput(v); }} maxLength={8} theme={theme} disabled={isBusy} />
      {error ? <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.md }}>{error}</ThemedText> : null}
      <Pressable
        style={[styles.confirmButton, { backgroundColor: pinInput.length >= MIN_PIN_LENGTH ? theme.primary : theme.border, marginTop: Spacing.xl }]}
        disabled={pinInput.length < MIN_PIN_LENGTH || isBusy}
        onPress={() => onDone(pinInput)}
      >
        {isBusy ? <ActivityIndicator color="#fff" size="small" /> : (
          <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>{doneLabel}</ThemedText>
        )}
      </Pressable>
    </View>
  );

  const renderRow = ({ item }: { item: LockedConversation }) => {
    if (!item.otherUser) return null;
    return (
      <Swipeable
        renderRightActions={() => (
          <Pressable
            style={[styles.unlockAction, { backgroundColor: theme.primary }]}
            onPress={() => handleUnlockChat(item)}
          >
            <Feather name="unlock" size={18} color="#fff" />
            <ThemedText type="small" style={{ color: "#fff", fontWeight: "700", marginTop: 2 }}>Unlock</ThemedText>
          </Pressable>
        )}
      >
        <Pressable
          style={[styles.row, { backgroundColor: theme.backgroundRoot }]}
          onPress={() => navigation.navigate("Conversation", {
            conversationId: item.id,
            otherUserId: item.otherUser!.id,
            otherUserName: item.otherUser!.displayName || "User",
          })}
        >
          <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.otherUser.avatarIndex || 0] }]}>
            <Feather name="user" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
              {item.otherUser.displayName || "User"}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
              {item.lastMessagePreview || "No messages yet"}
            </ThemedText>
          </View>
          <Feather name="lock" size={14} color={theme.textSecondary} />
        </Pressable>
      </Swipeable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot, paddingTop: Math.max(headerHeight, insets.top) }]}>
      {phase === "loading" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : phase === "setup" ? (
        renderPinStep(
          "Create a PIN",
          "This PIN protects your Locked Chats. It's separate from your other passwords and PINs.",
          handleSetupFirst,
          "Next"
        )
      ) : phase === "setupConfirm" ? (
        renderPinStep("Confirm PIN", "Re-enter your PIN to confirm", handleSetupConfirm, "Turn On")
      ) : phase === "verify" ? (
        <View style={styles.centerStep}>
          <View style={[styles.iconRing, { borderColor: theme.primary + "40", backgroundColor: theme.primary + "15" }]}>
            <Feather name="lock" size={26} color={theme.primary} />
          </View>
          <ThemedText type="h2" style={{ fontWeight: "700", marginTop: Spacing.md, marginBottom: Spacing.xl }}>
            Enter PIN
          </ThemedText>
          {lockoutSeconds > 0 ? (
            <ThemedText type="body" style={{ color: theme.error, textAlign: "center" }}>
              Too many attempts.{"\n"}Try again in {lockoutSeconds}s
            </ThemedText>
          ) : (
            <>
              <PinPad value={pinInput} onChange={(v) => { setError(null); setPinInput(v); }} maxLength={8} theme={theme} disabled={isBusy} />
              <Pressable
                style={[styles.confirmButton, { backgroundColor: pinInput.length >= MIN_PIN_LENGTH ? theme.primary : theme.border, marginTop: Spacing.xl }]}
                disabled={pinInput.length < MIN_PIN_LENGTH || isBusy}
                onPress={() => handleVerify(pinInput)}
              >
                {isBusy ? <ActivityIndicator color="#fff" size="small" /> : (
                  <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Unlock</ThemedText>
                )}
              </Pressable>
            </>
          )}
          {error ? <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.md }}>{error}</ThemedText> : null}
        </View>
      ) : phase === "changeCurrent" ? (
        renderPinStep("Enter Current PIN", "Confirm your current PIN to change it", handleChangeCurrent, "Continue")
      ) : phase === "changeNew" ? (
        renderPinStep("New PIN", "Choose a new PIN", handleChangeNewFirst, "Next")
      ) : phase === "changeConfirm" ? (
        renderPinStep("Confirm New PIN", "Re-enter to confirm", handleChangeConfirm, "Save")
      ) : (
        <>
          <View style={[styles.unlockedHeader, { paddingTop: Spacing.md }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
              Swipe a chat left to unlock it
            </ThemedText>
            <Pressable
              onPress={() => { setCurrentPinInput(""); setPinInput(""); setError(null); setPhase("changeCurrent"); }}
              hitSlop={8}
            >
              <ThemedText type="small" style={{ color: theme.primary, fontWeight: "600" }}>Change PIN</ThemedText>
            </Pressable>
          </View>
          {isLoadingList ? (
            <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: Spacing.xl }} />
          ) : conversations.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="lock" size={44} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                No locked chats yet
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginTop: 4 }}>
                Long-press a chat in your chat list and choose "Lock Chat"
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={renderRow}
              contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerStep: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    minWidth: 160,
    alignItems: "center",
  },
  unlockedHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  unlockAction: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
});
