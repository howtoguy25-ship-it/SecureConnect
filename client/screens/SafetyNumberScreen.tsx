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
import { computeSafetyNumber } from "@/utils/crypto/safetyNumber";
import { haptics } from "@/lib/haptics";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "SafetyNumber">;

const VERIFIED_KEY_PREFIX = "safety_number_verified_";

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

  const load = useCallback(async () => {
    if (!user?.id) return;
    setState("loading");
    try {
      const result = await computeSafetyNumber(user.id, peerUserId);
      if (!result) {
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
      setState("error");
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
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        alignItems: "center",
      }}
    >
      {state === "loading" ? (
        <View style={{ paddingTop: Spacing.xl * 2 }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : state === "error" ? (
        <View style={{ alignItems: "center", paddingTop: Spacing.xl * 2, gap: Spacing.md }}>
          <Feather name="alert-triangle" size={40} color={theme.warning} />
          <ThemedText type="body" style={{ textAlign: "center", color: theme.textSecondary }}>
            Couldn't compute a safety number right now — {peerUserName} may not have finished setting up
            encryption on their device yet, or there's a network problem. Try again shortly.
          </ThemedText>
          <Pressable
            onPress={load}
            style={[styles.verifyButton, { backgroundColor: theme.primary, marginTop: Spacing.md }]}
          >
            <ThemedText style={{ color: "#fff", fontWeight: "700" }}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.iconWrap, { backgroundColor: (verified ? "#4CD964" : theme.warning) + "18" }]}>
            <Feather name={verified ? "shield" : "shield"} size={32} color={verified ? "#4CD964" : theme.warning} />
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
