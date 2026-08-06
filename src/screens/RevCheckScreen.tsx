import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useSettings } from "@/context/SettingsContext";
import { recordManualCheck } from "@/services/vehicleHistory";
import { runRevCheck, type RevCheckResult } from "@/services/revCheck";
import { AU_STATES, DEFAULT_AU_STATE } from "@/utils/auStates";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import type { RootStackParamList } from "@/navigation/RootNavigator";

// Real, professionally-labelled vehicle history / REV check entry screen. Never fabricates a
// result -- see revCheck.ts's own header for exactly why (no PPSR/NEVDIS broker account exists
// for this app to call on the driver's behalf). What IS real here: the plate/state input, the
// AU state selector, this plate's own live-detection summary when opened from one, the Start
// button actually running the check function (not a dead stub), and Close actually navigating
// back -- all genuinely functional, just honest that the *data* behind a run needs a connected
// provider first.
export function RevCheckScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "RevCheck">>();
  const params = route.params;
  const { settings } = useSettings();

  const [plate, setPlate] = useState(params?.plate ?? "");
  const [state, setState] = useState(params?.state ?? DEFAULT_AU_STATE);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<RevCheckResult | null>(null);

  const hasVehicleSummary = params?.vehicleLabel !== undefined;
  const speedLabel = useMemo(() => {
    if (params?.speedKmh === undefined || params.speedKmh === null) return "Unknown";
    return params.speedKind === "closing"
      ? `${Math.round(Math.abs(params.speedKmh))} km/h closing`
      : `${Math.max(0, Math.round(params.speedKmh))} km/h`;
  }, [params?.speedKmh, params?.speedKind]);

  const onClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const onStart = useCallback(async () => {
    const trimmed = plate.trim().toUpperCase();
    if (!trimmed) return;
    setChecking(true);
    setResult(null);
    try {
      await recordManualCheck(trimmed, state);
      const outcome = await runRevCheck(trimmed, state, settings);
      setResult(outcome);
    } finally {
      setChecking(false);
    }
  }, [plate, state, settings]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Vehicle REV Check</Text>
          <Text style={styles.subtitle}>
            5-year registration &amp; odometer history, stolen/written-off/money-owing status --
            Australia only.
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close REV check"
          style={({ pressed }) => [styles.closeButton, pressed && { opacity: pressedOpacity }]}
        >
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {hasVehicleSummary && (
        <View style={styles.summaryCard}>
          <MaterialCommunityIcons name="car-info" size={20} color={colors.accent} />
          <View style={styles.summaryTextWrap}>
            <Text style={styles.summaryTitle}>From live AI detection</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Vehicle</Text>
              <Text style={styles.summaryValue}>{params?.vehicleLabel}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Speed travelling</Text>
              <Text style={styles.summaryValue}>{speedLabel}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Number plate</Text>
              <Text style={[styles.summaryValue, styles.summaryPlate]}>{params?.plate || "—"}</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>NUMBER PLATE</Text>
        <TextInput
          value={plate}
          onChangeText={(t) => setPlate(t.toUpperCase())}
          placeholder="e.g. ABC12D"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
          style={styles.plateInput}
        />

        <Text style={styles.fieldLabel}>STATE / TERRITORY</Text>
        <View style={styles.stateGrid}>
          {AU_STATES.map((s) => {
            const isSelected = state === s.code;
            return (
              <Pressable
                key={s.code}
                onPress={() => setState(s.code)}
                style={({ pressed }) => [
                  styles.stateChip,
                  isSelected && styles.stateChipSelected,
                  pressed && { opacity: pressedOpacity },
                ]}
                accessibilityLabel={s.label}
              >
                <Text style={[styles.stateChipText, isSelected && styles.stateChipTextSelected]}>
                  {s.code}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.helperText}>
          Vehicle history registers are looked up per Australian state/territory road authority --
          other countries aren't supported yet.
        </Text>

        <Pressable
          onPress={onStart}
          disabled={!plate.trim() || checking}
          style={({ pressed }) => [
            styles.startButton,
            (!plate.trim() || checking) && styles.startButtonDisabled,
            pressed && !checking && plate.trim() && { opacity: pressedOpacity },
          ]}
        >
          {checking ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.startButtonText}>Start REV Check</Text>
          )}
        </Pressable>
      </View>

      {result && (
        <View style={[styles.resultCard, result.connected ? styles.resultCardOk : styles.resultCardWarn]}>
          <MaterialCommunityIcons
            name={result.connected ? "check-decagram" : "information-outline"}
            size={20}
            color={result.connected ? colors.accent : colors.warning}
          />
          <Text style={styles.resultText}>{result.message}</Text>
        </View>
      )}

      <Pressable
        onPress={() => navigation.navigate("Settings")}
        style={({ pressed }) => [styles.settingsLink, pressed && { opacity: pressedOpacity }]}
      >
        <MaterialCommunityIcons name="key-variant" size={16} color={colors.accent} />
        <Text style={styles.settingsLinkText}>Manage REV check provider keys in Settings</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerTextWrap: { flex: 1, gap: spacing.xs },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.low,
  },
  summaryCard: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.low,
  },
  summaryTextWrap: { flex: 1, gap: spacing.xs },
  summaryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, color: colors.textMuted },
  summaryValue: { fontSize: 13, fontWeight: "700", color: colors.text },
  summaryPlate: { fontFamily: "monospace", letterSpacing: 1 },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.low,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  plateInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 52,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "monospace",
    letterSpacing: 2,
    color: colors.text,
  },
  stateGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 },
  stateChip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: "transparent",
  },
  stateChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  stateChipText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  stateChipTextSelected: { color: "#FFFFFF" },
  helperText: { fontSize: 12, color: colors.textFaint, lineHeight: 16 },
  startButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    ...shadow.low,
  },
  startButtonDisabled: { backgroundColor: colors.border },
  startButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  resultCard: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "flex-start",
  },
  resultCardOk: { backgroundColor: "#EFF6FF" },
  resultCardWarn: { backgroundColor: "#FEF3C7" },
  resultText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm,
  },
  settingsLinkText: { fontSize: 13, fontWeight: "600", color: colors.accent },
});
