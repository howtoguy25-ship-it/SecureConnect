import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, Switch, TextInput, Platform, Alert } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useCameraPermissions } from "expo-camera";
import {
  PEEK_COOLDOWN_PRESETS,
  PEEK_COOLDOWN_MIN_SECONDS,
  PEEK_COOLDOWN_MAX_SECONDS,
  getPeekDetectionEnabled,
  setPeekDetectionEnabled,
  getPeekCooldownSeconds,
  setPeekCooldownSeconds,
  clampCooldownSeconds,
  formatCooldownSeconds,
} from "@/utils/shoulderSurfing/settings";
import { haptics } from "@/lib/haptics";

export default function PeekDetectionSettingsScreen() {
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  // getPermission re-queries the OS fresh (unlike the hook's `permission`
  // snapshot, which is only fetched once at mount) — see handleToggle.
  const [, requestPermission, getPermission] = useCameraPermissions();
  const [enabled, setEnabled] = useState(false);
  const [cooldownSeconds, setCooldownSecondsState] = useState(60);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"seconds" | "minutes" | "hours" | "days">("minutes");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [e, c] = await Promise.all([getPeekDetectionEnabled(), getPeekCooldownSeconds()]);
      setEnabled(e);
      setCooldownSecondsState(c);
      setLoaded(true);
    })();
  }, []);

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (next) {
        // Re-query the OS permission fresh every time the feature is
        // turned on, rather than trusting `permission` from the hook's
        // mount-time snapshot. If the user revoked camera access from
        // device Settings while this screen (or the always-mounted
        // ShoulderSurfingGuard) stayed alive, the stale in-memory value
        // would still read "granted" and skip the real re-prompt —
        // silently leaving the feature either stuck off or, worse,
        // believed-on with no actual camera access.
        let status = await getPermission();
        if (!status?.granted) {
          status = await requestPermission();
        }
        if (!status?.granted) {
          const msg = "Peek Detection needs camera access to notice when someone else is looking at your screen. Enable it in your device settings to turn this on.";
          if (Platform.OS === "web") window.alert(msg);
          else Alert.alert("Camera access needed", msg);
          return;
        }
      }
      setEnabled(next);
      try {
        await setPeekDetectionEnabled(next);
        haptics.light();
      } catch {
        // Persist failed — the switch would otherwise show "on" while
        // AsyncStorage still has the old value, so the next time this
        // screen loads it silently reverts. Roll the UI back so what's
        // shown always matches what's actually saved.
        setEnabled(!next);
        const msg = "Couldn't save this setting. Please try again.";
        if (Platform.OS === "web") window.alert(msg);
        else Alert.alert("Error", msg);
      }
    },
    [requestPermission, getPermission],
  );

  const applyCooldown = useCallback(async (seconds: number) => {
    const clamped = clampCooldownSeconds(seconds);
    const previous = cooldownSeconds;
    setCooldownSecondsState(clamped);
    try {
      await setPeekCooldownSeconds(clamped);
      haptics.light();
    } catch {
      setCooldownSecondsState(previous);
      const msg = "Couldn't save this setting. Please try again.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    }
  }, [cooldownSeconds]);

  const applyCustom = useCallback(() => {
    const n = parseFloat(customValue);
    if (!Number.isFinite(n) || n <= 0) {
      const msg = "Enter a number greater than 0.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid value", msg);
      return;
    }
    const multiplier = { seconds: 1, minutes: 60, hours: 3600, days: 86400 }[customUnit];
    const seconds = n * multiplier;
    if (seconds < PEEK_COOLDOWN_MIN_SECONDS || seconds > PEEK_COOLDOWN_MAX_SECONDS) {
      const msg = `Custom value must be between ${PEEK_COOLDOWN_MIN_SECONDS} seconds and 7 days.`;
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Out of range", msg);
      return;
    }
    applyCooldown(seconds);
    setCustomValue("");
  }, [customValue, customUnit, applyCooldown]);

  const isPresetSelected = (presetSeconds: number) => loaded && cooldownSeconds === presetSeconds;
  const isCustomActive = loaded && !PEEK_COOLDOWN_PRESETS.some((p) => p.seconds === cooldownSeconds);

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: Spacing.xl * 2,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: Spacing.md }}>
            <ThemedText type="body" style={{ fontWeight: "700" }}>Peek Detection</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
              Uses your front camera while a chat is open. If it notices someone else may be looking at your screen, it asks whether to hide the chat.
            </ThemedText>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.warning + "12", borderColor: theme.warning + "30" }]}>
        <Feather name="info" size={16} color={theme.warning} />
        <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, lineHeight: 18 }}>
          This uses on-device face detection to notice when more than one face is in view of your front camera. It doesn't identify who anyone is, and nothing is ever sent off your device — detection runs entirely locally. Treat alerts as a helpful nudge, not a guarantee.
        </ThemedText>
      </View>

      <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        RE-CHECK COOLDOWN
      </ThemedText>
      <ThemedText type="small" style={[styles.description, { color: theme.textSecondary }]}>
        After you respond to a peek alert, wait this long before it can alert you again.
      </ThemedText>

      <View style={styles.presetGrid}>
        {PEEK_COOLDOWN_PRESETS.map((preset) => {
          const selected = isPresetSelected(preset.seconds);
          return (
            <Pressable
              key={preset.seconds}
              onPress={() => applyCooldown(preset.seconds)}
              style={[
                styles.presetChip,
                {
                  backgroundColor: selected ? theme.primary : theme.backgroundDefault,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}
            >
              <ThemedText
                type="small"
                style={{ color: selected ? "#fff" : theme.text, fontWeight: selected ? "700" : "400" }}
              >
                {preset.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault, marginTop: Spacing.md }]}>
        <ThemedText type="body" style={{ fontWeight: "700", marginBottom: Spacing.xs }}>
          Custom
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
          Minimum 5 seconds, maximum 7 days.
        </ThemedText>
        <View style={styles.customRow}>
          <TextInput
            value={customValue}
            onChangeText={setCustomValue}
            placeholder="e.g. 15"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
            style={[styles.customInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
          />
          <View style={styles.unitRow}>
            {(["seconds", "minutes", "hours", "days"] as const).map((unit) => (
              <Pressable
                key={unit}
                onPress={() => setCustomUnit(unit)}
                style={[
                  styles.unitChip,
                  {
                    backgroundColor: customUnit === unit ? theme.primary : theme.backgroundSecondary,
                    borderColor: customUnit === unit ? theme.primary : theme.border,
                  },
                ]}
              >
                <ThemedText type="small" style={{ color: customUnit === unit ? "#fff" : theme.textSecondary }}>
                  {unit}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable
          onPress={applyCustom}
          style={({ pressed }) => [styles.applyBtn, { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Set Custom Cooldown</ThemedText>
        </Pressable>
      </View>

      {loaded ? (
        <View style={[styles.currentCard, { backgroundColor: theme.primary + "12", borderColor: theme.primary + "30" }]}>
          <Feather name="clock" size={16} color={theme.primary} />
          <ThemedText type="small" style={{ color: theme.text }}>
            Current cooldown: <ThemedText type="small" style={{ fontWeight: "700" }}>{formatCooldownSeconds(cooldownSeconds)}</ThemedText>
            {isCustomActive ? " (custom)" : ""}
          </ThemedText>
        </View>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
    marginLeft: Spacing.sm,
    fontWeight: "600",
  },
  description: {
    marginBottom: Spacing.md,
    marginLeft: Spacing.sm,
    lineHeight: 18,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  presetChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  customRow: {
    gap: Spacing.sm,
  },
  customInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 16,
  },
  unitRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  unitChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  applyBtn: {
    marginTop: Spacing.md,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  currentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
});
