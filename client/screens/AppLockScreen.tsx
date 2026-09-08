import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, Alert, Platform, Animated, ActivityIndicator, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { PinPad } from "@/components/PinPad";
import { Feather } from "@expo/vector-icons";
import { Spacing, BorderRadius } from "@/constants/theme";
import {
  getAppLockSettings,
  verifyAppLockPin,
  getLockoutSecondsRemaining,
  type AppLockMode,
} from "@/utils/appLock";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";

interface AppLockScreenProps {
  onUnlock: () => void;
}

/** Full-screen overlay shown on cold launch and after the configured resume
 * timeout. Local-only: never touches the network. "Forgot PIN" signs the
 * user out (logout() clears the PIN too) rather than dead-ending them. */
export default function AppLockScreen({ onUnlock }: AppLockScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { logout } = useAuth();
  const [mode, setMode] = useState<AppLockMode>("numeric");
  // Null (not a default of 4) until getAppLockSettings() actually resolves —
  // otherwise a real PIN longer than 4 digits could auto-submit on just its
  // first 4 digits if SecureStore is slow to answer (plausible right after
  // launch, while PreKeyMaintenanceGuard is also hitting the keychain),
  // wasting a real lockout attempt on an incomplete entry.
  const [pinLength, setPinLength] = useState<number | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [entered, setEntered] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const settings = await getAppLockSettings();
      if (settings) {
        setMode(settings.mode);
        setPinLength(settings.length);
      }
      const remaining = await getLockoutSecondsRemaining();
      setLockoutSeconds(remaining);
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds > 0]);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const attemptUnlock = async (pin: string) => {
    if (isChecking || lockoutSeconds > 0 || !pin) return;
    setIsChecking(true);
    try {
      const ok = await verifyAppLockPin(pin);
      if (ok) {
        setError(null);
        onUnlock();
        return;
      }
      const remaining = await getLockoutSecondsRemaining();
      setLockoutSeconds(remaining);
      setError(remaining > 0 ? "Too many attempts. Try again shortly." : "Incorrect PIN");
      setEntered("");
      triggerShake();
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (mode === "numeric" && pinLength !== null && entered.length === pinLength) {
      attemptUnlock(entered);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, mode, pinLength]);

  const handleForgotPin = () => {
    const message =
      "Your app-lock PIN is stored only on this device and can't be recovered. " +
      "You'll need to sign out and verify your phone number again to get back in.";
    if (Platform.OS === "web") {
      if (window.confirm(`Forgot PIN?\n\n${message}`)) {
        logout().catch(() => {});
      }
      return;
    }
    Alert.alert("Forgot PIN?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { logout().catch(() => {}); } },
    ]);
  };

  return (
    <View style={[styles.overlay, { backgroundColor: theme.backgroundRoot }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.content,
            { paddingTop: insets.top + Spacing["2xl"], paddingBottom: insets.bottom + Spacing.lg },
          ]}
        >
          <View style={styles.centerGroup}>
            <View style={styles.header}>
              <View style={[styles.iconGlow, { backgroundColor: theme.primary + "0D" }]}>
                <View style={[styles.iconRing, { borderColor: theme.primary + "40", backgroundColor: theme.primary + "1A" }]}>
                  <Feather name="lock" size={30} color={theme.primary} />
                </View>
              </View>
              <ThemedText type="h1" style={{ marginTop: Spacing.lg, fontWeight: "800" }}>
                Pryvo Locked
              </ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: 6 }}>
                {mode === "numeric" ? "Enter your PIN to continue" : "Enter your passcode to continue"}
              </ThemedText>
            </View>

            <Animated.View
              style={[
                styles.body,
                {
                  transform: [
                    {
                      translateX: shakeAnim.interpolate({
                        inputRange: [-1, 0, 1],
                        outputRange: [-10, 0, 10],
                      }),
                    },
                  ],
                },
              ]}
            >
              {!settingsLoaded ? (
                <ActivityIndicator size="large" color={theme.primary} />
              ) : lockoutSeconds > 0 ? (
                <View style={[styles.lockoutBox, { backgroundColor: theme.error + "12", borderColor: theme.error + "30" }]}>
                  <Feather name="clock" size={22} color={theme.error} />
                  <ThemedText type="body" style={{ color: theme.error, marginTop: Spacing.sm, textAlign: "center" }}>
                    Too many attempts.{"\n"}Try again in {lockoutSeconds}s
                  </ThemedText>
                </View>
              ) : mode === "numeric" ? (
                <PinPad
                  value={entered}
                  onChange={(v) => {
                    setError(null);
                    setEntered(v);
                  }}
                  maxLength={pinLength ?? 8}
                  theme={theme}
                  disabled={isChecking}
                />
              ) : (
                <View style={styles.alphaWrap}>
                  <View style={[styles.alphaInputWrap, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}>
                    <Feather name="key" size={18} color={theme.textSecondary} style={styles.alphaInputIcon} />
                    <TextInput
                      value={entered}
                      onChangeText={(v) => {
                        setError(null);
                        setEntered(v);
                      }}
                      secureTextEntry
                      autoFocus
                      editable={!isChecking}
                      placeholder="Passcode"
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.alphaInput, { color: theme.text }]}
                      onSubmitEditing={() => attemptUnlock(entered)}
                      returnKeyType="done"
                    />
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.unlockButton,
                      { backgroundColor: entered.length > 0 ? theme.primary : theme.border, opacity: pressed ? 0.85 : 1 },
                    ]}
                    onPress={() => attemptUnlock(entered)}
                    disabled={entered.length === 0 || isChecking}
                  >
                    {isChecking ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="unlock" size={17} color="#fff" style={{ marginRight: 8 }} />
                        <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
                          Unlock
                        </ThemedText>
                      </>
                    )}
                  </Pressable>
                </View>
              )}

              {error ? (
                <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.md, textAlign: "center" }}>
                  {error}
                </ThemedText>
              ) : null}
            </Animated.View>
          </View>

          <Pressable onPress={handleForgotPin} style={styles.forgotButton} hitSlop={12}>
            <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "600" }}>
              Forgot PIN?
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
  },
  // The whole icon/title/input/button group is centered as ONE block
  // (rather than the header pinned to the top and the input pinned to
  // dead-center of the full screen, which is what produced the huge
  // empty gap between them) — reads as one intentional card instead of
  // three disconnected pieces floating in a mostly-empty screen.
  centerGroup: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  header: {
    alignItems: "center",
  },
  iconGlow: {
    width: 108,
    height: 108,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  iconRing: {
    width: 68,
    height: 68,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  body: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing["2xl"],
  },
  lockoutBox: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  alphaWrap: {
    width: "100%",
    alignItems: "center",
    gap: Spacing.md,
  },
  alphaInputWrap: {
    width: "100%",
    maxWidth: 320,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
  },
  alphaInputIcon: {
    marginRight: Spacing.sm,
  },
  alphaInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: 16,
    letterSpacing: 2,
  },
  unlockButton: {
    width: "100%",
    maxWidth: 320,
    flexDirection: "row",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotButton: {
    paddingVertical: Spacing.sm,
  },
});
