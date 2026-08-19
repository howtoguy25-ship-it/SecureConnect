import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, ScrollView, Share, Platform } from "react-native";
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { computeSafetyNumber, type SafetyNumberFailureReason } from "@/utils/crypto/safetyNumber";
import { haptics } from "@/lib/haptics";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "SafetyNumber">;

const VERIFIED_KEY_PREFIX = "safety_number_verified_";

// One honest, specific message per failure reason instead of a single
// generic guess — "peer hasn't set up encryption" used to be shown even
// when the real cause was a network error or (rarely) this device's own
// keys still being generated.
const ERROR_COPY: Record<
  SafetyNumberFailureReason,
  { icon: React.ComponentProps<typeof Feather>["name"]; title: string; message: (peerName: string) => string }
> = {
  peer_no_keys: {
    icon: "clock",
    title: "Waiting on the Other Side",
    message: (peerName) =>
      `${peerName} hasn't finished setting up encryption on their device yet. This screen will update on its own the moment they do — no need to keep checking.`,
  },
  network_error: {
    icon: "wifi-off",
    title: "Connection Problem",
    message: () =>
      "Couldn't reach the server to check encryption keys. Check your connection and try again.",
  },
  my_keys_missing: {
    icon: "key",
    title: "Finishing Your Setup",
    message: () =>
      "Your device is still finishing its own encryption setup. This should resolve in a moment — try again shortly.",
  },
};

export default function SafetyNumberScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const { userId: peerUserId, userName: peerUserName } = route.params;

  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [number, setNumber] = useState<string>("");
  const [digestId, setDigestId] = useState<string>("");
  const [verified, setVerified] = useState(false);
  const [failureReason, setFailureReason] = useState<SafetyNumberFailureReason>("network_error");
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async (isBackgroundRetry = false) => {
    if (!user?.id) return;
    if (isBackgroundRetry) {
      setRetrying(true);
    } else {
      setState("loading");
    }
    try {
      const result = await computeSafetyNumber(user.id, peerUserId);
      if (!result.ok) {
        setFailureReason(result.reason);
        setState("error");
        return;
      }
      setNumber(result.formatted);
      setDigestId(result.digestId);
      const storedDigest = await AsyncStorage.getItem(`${VERIFIED_KEY_PREFIX}${peerUserId}`);
      // If either side's identity or signing key has changed since the
      // last time this was verified, the number — and therefore the
      // digest — is different now. Don't carry stale trust forward: this
      // resets to "not verified" automatically rather than silently
      // keeping the old checkmark.
      setVerified(storedDigest === result.digestId);
      setState("ready");
    } catch {
      setFailureReason("network_error");
      setState("error");
    } finally {
      setRetrying(false);
    }
  }, [user?.id, peerUserId]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-check on every focus, not just mount — catches the case where the
  // peer's keys changed (or ours did) while this screen was backgrounded.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // If the peer hasn't finished setting up encryption yet, don't leave the
  // user stuck on the error screen forever with only a manual Retry button —
  // poll the same way ConversationScreen's no_keys banner does, so this
  // resolves on its own within seconds of the peer verifying and logging in.
  useEffect(() => {
    if (state !== "error") return;
    // Background — not load(), which would flip the screen back to the
    // full-screen spinner every 8s and flash the error card in and out
    // from under the user for as long as the peer hasn't set up encryption.
    const interval = setInterval(() => {
      load(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [state, load]);

  const handleToggleVerified = async () => {
    haptics.medium();
    if (verified) {
      await AsyncStorage.removeItem(`${VERIFIED_KEY_PREFIX}${peerUserId}`);
      setVerified(false);
    } else {
      await AsyncStorage.setItem(`${VERIFIED_KEY_PREFIX}${peerUserId}`, digestId);
      setVerified(true);
      haptics.success();
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `My Pryvo safety number with ${peerUserName}:\n\n${number}\n\nCompare this with them in person or over a channel you already trust — if it doesn't match exactly on both sides, don't trust this chat.`,
      });
    } catch {}
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        alignItems: "center",
        // Loading/error states are short and look stranded pinned to the
        // top with a large empty gap below on most screens — center them
        // in the available space instead. The "ready" state has enough
        // content to fill the screen on its own and should stay
        // top-anchored so it scrolls naturally instead of jumping around
        // as its height changes.
        justifyContent: state === "ready" ? "flex-start" : "center",
      }}
    >
      {state === "loading" ? (
        <View style={{ paddingTop: Spacing.xl * 2 }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : state === "error" ? (
        <View style={[styles.errorCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.warning + "18" }]}>
            <Feather name={ERROR_COPY[failureReason].icon} size={32} color={theme.warning} />
          </View>

          <ThemedText type="h3" style={{ textAlign: "center", marginTop: Spacing.md, fontWeight: "700" }}>
            {ERROR_COPY[failureReason].title}
          </ThemedText>

          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
            {ERROR_COPY[failureReason].message(peerUserName)}
          </ThemedText>

          {failureReason === "peer_no_keys" ? (
            <View style={styles.autoCheckRow}>
              <ActivityIndicator size="small" color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: Spacing.sm }}>
                Checking again automatically
              </ThemedText>
            </View>
          ) : null}

          <Pressable
            onPress={() => load(false)}
            disabled={retrying}
            style={[styles.verifyButton, { backgroundColor: theme.primary, marginTop: Spacing.lg, opacity: retrying ? 0.7 : 1 }]}
          >
            {retrying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={{ color: "#fff", fontWeight: "700" }}>Retry Now</ThemedText>
            )}
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.iconWrap, { backgroundColor: (verified ? "#4CD964" : theme.warning) + "18" }]}>
            <Feather name={verified ? "shield" : "alert-triangle"} size={32} color={verified ? "#4CD964" : theme.warning} />
          </View>

          <ThemedText type="h3" style={{ textAlign: "center", marginTop: Spacing.md, fontWeight: "700" }}>
            {verified ? "Verified" : "Verify Safety Number"}
          </ThemedText>

          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
            This number is derived from your and {peerUserName}'s long-term encryption keys — the same keys
            that secure every message and call between you. If it matches on both devices, no one is
            intercepting your conversation. Compare it in person, by phone, or through any channel you
            already trust — not through this chat itself.
          </ThemedText>

          <View
            style={[
              styles.numberCard,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
            ]}
          >
            <ThemedText
              style={[styles.numberText, { color: theme.text }]}
              selectable
            >
              {number}
            </ThemedText>
          </View>

          <Pressable
            onPress={handleToggleVerified}
            style={[
              styles.verifyButton,
              { backgroundColor: verified ? "transparent" : theme.primary, borderWidth: verified ? 2 : 0, borderColor: theme.border },
            ]}
          >
            <Feather name={verified ? "x-circle" : "check-circle"} size={18} color={verified ? theme.textSecondary : "#fff"} />
            <ThemedText style={{ color: verified ? theme.textSecondary : "#fff", fontWeight: "700", marginLeft: Spacing.sm }}>
              {verified ? "Mark as Not Verified" : "Mark as Verified"}
            </ThemedText>
          </Pressable>

          <Pressable onPress={handleShare} style={[styles.shareButton]}>
            <Feather name="share" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: Spacing.xs }}>
              Share this number
            </ThemedText>
          </Pressable>

          <View style={[styles.warningBox, { backgroundColor: theme.warning + "12", borderColor: theme.warning + "30" }]}>
            <Feather name="info" size={14} color={theme.warning} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: Spacing.sm, flex: 1 }}>
              If this number ever changes without {peerUserName} telling you they reinstalled or reset the
              app, treat it as a warning sign — it means their encryption key changed, which "Verified" here
              will automatically clear.
            </ThemedText>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
  },
  autoCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  numberCard: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginTop: Spacing.xl,
  },
  numberText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 18,
    lineHeight: 28,
    textAlign: "center",
    letterSpacing: 1,
  },
  verifyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    width: "100%",
  },
});
