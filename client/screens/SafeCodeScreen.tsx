import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import * as ScreenCapture from "expo-screen-capture";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SafeCodeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<Nav>();
  const { user, setUser, refreshUser } = useAuth();

  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);
  const [copied, setCopied] = useState(false);

  // The Account ID shown on this screen is the one and only time it's ever
  // displayed in plaintext — screenshotting it and letting the image sync to
  // cloud photo storage defeats the entire point of "write it down somewhere
  // secret". Block screenshots/recording for as long as this screen is
  // mounted.
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync("safe-code").catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync("safe-code").catch(() => {});
    };
  }, []);

  const fetchCode = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Check for a freshly-generated Safe Code persisted at signup. The
      //    server returns it once in the verify-code response and we cache it
      //    so this screen can display it without a second round-trip.
      try {
        const pending = await AsyncStorage.getItem("pending_safe_code");
        if (pending) {
          setCode(pending);
          return;
        }
      } catch {}

      // 2. Otherwise, ask the server to generate one (only succeeds if the
      //    user has never generated a code before).
      try {
        const res = await apiRequest("POST", "/api/auth/safe-code/generate", {});
        const data = await res.json();
        if (data?.code) {
          setCode(data.code);
          // Persist for the same reason as above (so a refresh keeps it
          // visible until the user explicitly acknowledges).
          try { await AsyncStorage.setItem("pending_safe_code", data.code); } catch {}
        } else {
          setCode(null);
        }
      } catch (err: any) {
        // Server already has a hash for this user — code can't be re-shown.
        if (err?.message?.toLowerCase?.().includes("already")) {
          setCode(null);
        } else {
          Alert.alert("Error", "Failed to load Safe Code. Please try again.");
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  async function copyCode() {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  async function acknowledge() {
    if (acknowledging) return;
    setAcknowledging(true);
    try {
      await apiRequest("POST", "/api/auth/safe-code/acknowledge", {});
      // Wipe the locally-cached plaintext — once acknowledged it must never
      // be displayed again (the server only retains a bcrypt hash).
      try { await AsyncStorage.removeItem("pending_safe_code"); } catch {}
      // Update local state directly rather than relying solely on a
      // follow-up /me fetch — if that fetch hits any hiccup, fetchCurrentUser
      // silently falls back to the STALE cached user (still
      // safeCodeAcknowledged: false), which made this screen look like it
      // "didn't save" even though the server had already recorded it, and
      // meant it kept reappearing on every subsequent app launch. The POST
      // above already succeeded, so it's safe to reflect that immediately.
      if (user) setUser({ ...user, safeCodeAcknowledged: true });
      // Best-effort background sync; local state above is already correct.
      refreshUser().catch(() => {});

      // If we landed here via push navigation (e.g. Settings → Safe Code),
      // pop back to the previous screen. Otherwise the root navigator will
      // automatically swap this screen out for the main app once the user's
      // safeCodeAcknowledged flag becomes true.
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to save acknowledgment. Please try again.";
      if (Platform.OS === "web") {
        try { window.alert(`Error\n\n${msg}`); } catch {}
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      // Always re-enable the button. If the navigator swaps the screen out
      // because user state flipped, this state update is a no-op on unmount.
      setAcknowledging(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      <View style={[styles.iconBubble, { backgroundColor: theme.primary + "18" }]}>
        <Feather name="shield" size={32} color={theme.primary} />
      </View>

      <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
        Your Account ID
      </ThemedText>
      <ThemedText
        type="body"
        style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}
      >
        Copy this and save it somewhere very secret. Combined with your security question answers, it's the only way to recover your account if you ever lose access to your phone number.
      </ThemedText>

      {code ? (
        <>
          <View style={[styles.codeCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <ThemedText
              type="h2"
              style={{
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontSize: 18,
                letterSpacing: 1,
                textAlign: "center",
              }}
            >
              {code}
            </ThemedText>
          </View>

          <Pressable
            onPress={copyCode}
            style={({ pressed }) => [
              styles.copyBtn,
              { backgroundColor: theme.backgroundSecondary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name={copied ? "check" : "copy"} size={16} color={theme.text} />
            <ThemedText type="body" style={{ fontWeight: "600", marginLeft: 8 }}>
              {copied ? "Copied" : "Copy Code"}
            </ThemedText>
          </Pressable>
        </>
      ) : (
        <View style={[styles.warningCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <Feather name="check-circle" size={20} color={theme.primary} style={{ marginBottom: 8 }} />
          <ThemedText type="body" style={{ fontWeight: "700", marginBottom: 4 }}>
            Account ID already created
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 18 }}>
            For your security, your Account ID can only be shown once. If you lost it, contact support to reset your account protection.
          </ThemedText>
        </View>
      )}

      <View style={[styles.warningCard, { backgroundColor: theme.warning + "10", borderColor: theme.warning + "40", marginTop: Spacing.lg }]}>
        <Feather name="alert-triangle" size={18} color={theme.warning} style={{ marginBottom: 6 }} />
        <ThemedText type="small" style={{ color: theme.text, lineHeight: 18 }}>
          • Never share your Account ID with anyone — not even Pryvo support.{"\n"}
          • This code is shown only once and cannot be recovered if lost.{"\n"}
          • Anyone with this ID and your security question answers can recover access to your account.
        </ThemedText>
      </View>

      <Pressable
        onPress={acknowledge}
        disabled={acknowledging}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: theme.primary, opacity: pressed || acknowledging ? 0.7 : 1 },
        ]}
      >
        {acknowledging ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
            I've Saved My Account ID — Continue
          </ThemedText>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  codeCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  warningCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  primaryBtn: {
    marginTop: Spacing.xl,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
