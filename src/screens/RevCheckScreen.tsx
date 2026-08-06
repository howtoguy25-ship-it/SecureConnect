import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useSettings } from "@/context/SettingsContext";
import { recordManualCheck, recordRevCheckResult, getVehicleHistory } from "@/services/vehicleHistory";
import { runRevCheck, isRevCheckProviderConfigured, type RevCheckResult } from "@/services/revCheck";
import { AU_STATES, DEFAULT_AU_STATE } from "@/utils/auStates";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import type { RootStackParamList } from "@/navigation/RootNavigator";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

// Real vehicle history / REV check screen, wired to BusinessAPI.com.au's live PPSR Searches API
// (see revCheck.ts's own header for the full contract this follows) once a provider key is
// saved in Settings. PPSR searches by VIN, never a plate -- a plate isn't stable enough for
// PPSR's own purpose (see revCheck.ts) -- so the plate field here is for this app's own record
// (matches what the AI detector actually reads) while the VIN field is what a real check
// actually runs on. Never fabricates a result: with no provider key, or on any error, this shows
// the real outcome from revCheck.ts, not invented data.
export function RevCheckScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "RevCheck">>();
  const params = route.params;
  const { settings } = useSettings();

  const [plate, setPlate] = useState(params?.plate ?? "");
  const [vin, setVin] = useState(params?.vin ?? "");
  const [state, setState] = useState(params?.state ?? DEFAULT_AU_STATE);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<RevCheckResult | null>(null);
  // Set only when `result` came from a PAST paid check loaded off this vehicle's history entry
  // (see the load effect below), never from a check just run this instant -- lets the render
  // show an honest "last checked X ago" instead of implying a stale result just happened live.
  const [cachedResultAt, setCachedResultAt] = useState<number | null>(null);

  const providerConfigured = isRevCheckProviderConfigured(settings);

  // A real REV check costs real money (see the $6 notice below) -- closing this screen (or the
  // driver just navigating away) must never lose a result they already paid for. Loads whatever
  // was last saved for this exact plate/VIN (see vehicleHistory.ts's recordRevCheckResult) the
  // moment this screen opens with one prefilled, so re-opening a saved vehicle from history shows
  // its last real result immediately instead of a blank form the driver would have to pay to
  // refill.
  useEffect(() => {
    const lookupPlate = params?.plate?.trim().toUpperCase();
    const lookupVin = params?.vin?.trim().toUpperCase();
    if (!lookupPlate && !lookupVin) return;
    let cancelled = false;
    getVehicleHistory().then((history) => {
      if (cancelled) return;
      const match = history.find(
        (e) => (lookupPlate && e.plate === lookupPlate) || (lookupVin && e.vin === lookupVin)
      );
      if (match?.lastResult) {
        setResult({
          outcome: "success",
          message: "Check complete.",
          vehicle: match.lastResult.vehicle,
          securedInterestCount: match.lastResult.securedInterestCount,
          certificateUrl: match.lastResult.certificateUrl,
        });
        setCachedResultAt(match.lastResult.checkedAt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [params?.plate, params?.vin]);

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
    const trimmedVin = vin.trim().toUpperCase();
    const trimmedPlate = plate.trim().toUpperCase();
    if (!trimmedVin) return;
    setChecking(true);
    setResult(null);
    setCachedResultAt(null);
    try {
      await recordManualCheck(trimmedPlate, state, trimmedVin);
      const outcome = await runRevCheck(trimmedVin, settings);
      setResult(outcome);
      if (outcome.outcome === "success") {
        await recordRevCheckResult(trimmedPlate, trimmedVin, {
          vehicle: outcome.vehicle,
          securedInterestCount: outcome.securedInterestCount,
          certificateUrl: outcome.certificateUrl,
        });
      }
    } finally {
      setChecking(false);
    }
  }, [plate, vin, state, settings]);

  const onOpenCertificate = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Vehicle REV Check</Text>
          <Text style={styles.subtitle}>
            Stolen / written-off / money-owing status &amp; NEVDIS vehicle data -- Australia only,
            searched by VIN.
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
        <Text style={styles.fieldLabel}>VIN (required for a real check)</Text>
        <TextInput
          value={vin}
          onChangeText={(t) => setVin(t.toUpperCase())}
          placeholder="e.g. ZAM57YTA0T0000042"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={17}
          style={styles.plateInput}
        />
        <Text style={styles.helperText}>
          The 17-character chassis number -- on the rego papers, or the compliance plate visible
          through the windshield. PPSR searches by VIN, not plate, since a plate can change on
          re-registration.
        </Text>

        <Text style={styles.fieldLabel}>NUMBER PLATE (for your own records)</Text>
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
          Kept with this record for your own reference -- not sent to the PPSR search itself,
          which is a national (not state-based) register.
        </Text>

        {providerConfigured && (
          <View style={styles.costNotice}>
            <MaterialCommunityIcons name="currency-usd" size={14} color={colors.warning} />
            <Text style={styles.costNoticeText}>
              Running this check charges $6.00 via your connected PPSR provider account.
            </Text>
          </View>
        )}

        <Pressable
          onPress={onStart}
          disabled={!vin.trim() || checking}
          style={({ pressed }) => [
            styles.startButton,
            (!vin.trim() || checking) && styles.startButtonDisabled,
            pressed && !checking && vin.trim() && { opacity: pressedOpacity },
          ]}
        >
          {checking ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.startButtonText}>Start REV Check</Text>
          )}
        </Pressable>
      </View>

      {result && result.outcome === "success" && (
        <View style={styles.successCard}>
          <View style={styles.successHeader}>
            <MaterialCommunityIcons name="check-decagram" size={20} color={colors.accent} />
            <Text style={styles.successHeaderText}>
              {cachedResultAt ? `Last checked ${relativeTime(cachedResultAt)}` : "Real result from PPSR/NEVDIS"}
            </Text>
          </View>

          {result.vehicle ? (
            <>
              <View style={styles.detailRowLight}>
                <Text style={styles.detailLabelLight}>Vehicle</Text>
                <Text style={styles.detailValueLight}>
                  {[result.vehicle.year, result.vehicle.make, result.vehicle.model].filter(Boolean).join(" ") || "—"}
                </Text>
              </View>
              <View style={styles.detailRowLight}>
                <Text style={styles.detailLabelLight}>Colour / body</Text>
                <Text style={styles.detailValueLight}>
                  {[result.vehicle.colour, result.vehicle.bodyType].filter(Boolean).join(" · ") || "—"}
                </Text>
              </View>
              <View style={styles.detailRowLight}>
                <Text style={styles.detailLabelLight}>Plate on record</Text>
                <Text style={styles.detailValueLight}>{result.vehicle.registrationPlate ?? "—"}</Text>
              </View>
              <View style={styles.detailRowLight}>
                <Text style={styles.detailLabelLight}>Rego expiry</Text>
                <Text style={styles.detailValueLight}>{result.vehicle.registrationExpiry ?? "—"}</Text>
              </View>
              <View style={styles.detailRowLight}>
                <Text style={styles.detailLabelLight}>Stolen</Text>
                <Text style={[styles.detailValueLight, result.vehicle.stolen && styles.detailValueDanger]}>
                  {result.vehicle.stolen ? "YES" : "No"}
                </Text>
              </View>
              <View style={styles.detailRowLight}>
                <Text style={styles.detailLabelLight}>Written off</Text>
                <Text style={[styles.detailValueLight, result.vehicle.writtenOff && styles.detailValueDanger]}>
                  {result.vehicle.writtenOff ? "YES" : "No"}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.resultText}>
              No NEVDIS vehicle data came back for this VIN -- the PPSR security-interest result
              below is still real.
            </Text>
          )}

          <View style={styles.detailRowLight}>
            <Text style={styles.detailLabelLight}>Registered security interests</Text>
            <Text
              style={[
                styles.detailValueLight,
                (result.securedInterestCount ?? 0) > 0 && styles.detailValueDanger,
              ]}
            >
              {result.securedInterestCount ?? 0}
            </Text>
          </View>

          {result.certificateUrl && (
            <Pressable
              onPress={() => onOpenCertificate(result.certificateUrl as string)}
              style={({ pressed }) => [styles.certButton, pressed && { opacity: pressedOpacity }]}
            >
              <MaterialCommunityIcons name="file-certificate-outline" size={16} color={colors.accent} />
              <Text style={styles.certButtonText}>View PPSR certificate</Text>
            </Pressable>
          )}
        </View>
      )}

      {result && result.outcome !== "success" && (
        <View style={[styles.resultCard, result.outcome === "error" ? styles.resultCardError : styles.resultCardWarn]}>
          <MaterialCommunityIcons
            name={result.outcome === "error" ? "alert-circle-outline" : "information-outline"}
            size={20}
            color={result.outcome === "error" ? colors.danger : colors.warning}
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
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "monospace",
    letterSpacing: 1.5,
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
  costNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "#FEF3C7",
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  costNoticeText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#92400E" },
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
  resultCardWarn: { backgroundColor: "#FEF3C7" },
  resultCardError: { backgroundColor: "#FEE2E2" },
  resultText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.low,
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  successHeaderText: { fontSize: 13, fontWeight: "800", color: colors.text },
  detailRowLight: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabelLight: { fontSize: 13, color: colors.textMuted },
  detailValueLight: { fontSize: 13, fontWeight: "700", color: colors.text },
  detailValueDanger: { color: colors.danger },
  certButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  certButtonText: { fontSize: 13, fontWeight: "700", color: colors.accent },
  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm,
  },
  settingsLinkText: { fontSize: 13, fontWeight: "600", color: colors.accent },
});
