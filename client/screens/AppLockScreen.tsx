import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, Alert, Platform, Animated, ActivityIndicator } from "react-native";
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
    <View style={[styles.overlay, { backgroundColor: theme.backgroundRoot, paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}>
      <View style={styles.header}>
        <View style={[styles.iconRing, { borderColor: theme.primary + "40", backgroundColor: theme.primary + "15" }]}>
          <Feather name="lock" size={28} color={theme.primary} />
        </View>
        <ThemedText type="h2" style={{ marginTop: Spacing.md, fontWeight: "700" }}>
          Pryvo Locked
        </ThemedText>
        <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: 4 }}>
          {mode === "numeric" ? "Enter your PIN" : "Enter your passcode"}
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
          <View style={styles.lockoutBox}>
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
              style={[styles.alphaInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundTertiary }]}
              onSubmitEditing={() => attemptUnlock(entered)}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.unlockButton, { backgroundColor: entered.length > 0 ? theme.primary : theme.border }]}
              onPress={() => attemptUnlock(entered)}
              disabled={entered.length === 0 || isChecking}
            >
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
                Unlock
              </ThemedText>
            </Pressable>
          </View>
        )}

        {error ? (
          <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.md, textAlign: "center" }}>
            {error}
          </ThemedText>
        ) : null}
      </Animated.View>

      <Pressable onPress={handleForgotPin} style={styles.forgotButton} hitSlop={12}>
        <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "600" }}>
          Forgot PIN?
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
  },
  header: {
    alignItems: "center",
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  body: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  lockoutBox: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  alphaWrap: {
    width: "100%",
    alignItems: "center",
    gap: Spacing.md,
  },
  alphaInput: {
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    textAlign: "center",
    letterSpacing: 2,
  },
  unlockButton: {
    width: "100%",
    maxWidth: 320,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  forgotButton: {
    paddingVertical: Spacing.sm,
  },
});
