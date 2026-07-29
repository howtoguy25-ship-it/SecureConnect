import React, { useCallback } from "react";
import { View, Text, Image, StyleSheet, Switch, ScrollView } from "react-native";
import Slider from "@react-native-community/slider";
import Constants from "expo-constants";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { syncAlertRadiusToProfile } from "@/services/userProfile";
import { setVoiceEnabled } from "@/services/voice";
import { BUSINESS_INFO } from "@/config/business";
import { colors, radius, shadow, spacing } from "@/theme/tokens";
import { ALL_ALERT_TYPES, DEFAULT_ALERT_RADIUS_KM } from "@/services/settings";
import { ALERT_LABELS, type AlertType } from "@/types/alert";

function sensitivityLabel(value: number): string {
  if (value <= 0.4) return "Low";
  if (value <= 0.7) return "Medium";
  return "High";
}

export function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();

  const onRadiusChange = useCallback(
    async (value: number) => {
      const rounded = Math.round(value);
      await updateSettings({ alertRadiusKm: rounded });
      if (user) await syncAlertRadiusToProfile(user.uid, rounded);
    },
    [updateSettings, user]
  );

  // Off = no alerts shown/received at all, regardless of radius. Turning it back on resets
  // to a fresh 30km radius rather than whatever it was left at -- the user's own spec.
  const onAlertsEnabledToggle = useCallback(
    async (value: boolean) => {
      if (value) {
        await updateSettings({ alertsEnabled: true, alertRadiusKm: DEFAULT_ALERT_RADIUS_KM });
        if (user) await syncAlertRadiusToProfile(user.uid, DEFAULT_ALERT_RADIUS_KM);
      } else {
        await updateSettings({ alertsEnabled: false });
      }
    },
    [updateSettings, user]
  );

  const onAlertTypeToggle = useCallback(
    (type: AlertType, value: boolean) => {
      updateSettings({
        visibleAlertTypes: value
          ? [...settings.visibleAlertTypes, type]
          : settings.visibleAlertTypes.filter((t) => t !== type),
      });
    },
    [updateSettings, settings.visibleAlertTypes]
  );

  const onShowTrafficLightsToggle = useCallback(
    (value: boolean) => updateSettings({ showTrafficLights: value }),
    [updateSettings]
  );

  const onShowSpeedCamerasToggle = useCallback(
    (value: boolean) => updateSettings({ showSpeedCameras: value }),
    [updateSettings]
  );

  const onSensitivityChange = useCallback(
    (value: number) => {
      updateSettings({ sirenSensitivity: Math.round(value * 20) / 20 });
    },
    [updateSettings]
  );

  const onAutoShareToggle = useCallback(
    (value: boolean) => {
      updateSettings({ autoShareDetections: value });
    },
    [updateSettings]
  );

  const onDefaultVoiceToggle = useCallback(
    async (value: boolean) => {
      await updateSettings({ defaultVoiceEnabled: value });
      await setVoiceEnabled(value);
    },
    [updateSettings]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="Live alerts">
        <Row label="Receive alerts">
          <Switch
            value={settings.alertsEnabled}
            onValueChange={onAlertsEnabledToggle}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Row>
        <Text style={styles.helperText}>
          Off — you won't see or receive any community alerts. Turning it back on sets your
          radius to 30 km; adjust it below any time.
        </Text>

        <Row label={`Alert visibility radius — ${settings.alertRadiusKm} km`}>
          <Slider
            minimumValue={1}
            maximumValue={200}
            step={1}
            value={settings.alertRadiusKm}
            onSlidingComplete={onRadiusChange}
            disabled={!settings.alertsEnabled}
            minimumTrackTintColor={colors.accent}
          />
        </Row>

        <View style={styles.alertTypeGrid}>
          {ALL_ALERT_TYPES.map((type) => (
            <View key={type} style={styles.alertTypeRow}>
              <Text style={styles.alertTypeLabel}>{ALERT_LABELS[type]}</Text>
              <Switch
                value={settings.visibleAlertTypes.includes(type)}
                onValueChange={(value) => onAlertTypeToggle(type, value)}
                disabled={!settings.alertsEnabled}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            </View>
          ))}
        </View>
      </Section>

      <Section title="Map layers">
        <Row label="Traffic lights">
          <Switch
            value={settings.showTrafficLights}
            onValueChange={onShowTrafficLightsToggle}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Row>
        <Row label="Speed cameras">
          <Switch
            value={settings.showSpeedCameras}
            onValueChange={onShowSpeedCamerasToggle}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Row>
        <Text style={styles.helperText}>
          Every known traffic light and fixed speed camera location, mapped by OpenStreetMap's
          community — shown independently on the map, whether or not "Live alerts" is on.
        </Text>
      </Section>

      <Section title="EV Radar (siren detection)">
        <Row label="Auto-share detections">
          <Switch
            value={settings.autoShareDetections}
            onValueChange={onAutoShareToggle}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Row>
        <Text style={styles.helperText}>
          When on, a confirmed siren detection automatically posts an "Emergency Vehicle" alert
          at your location for nearby drivers. Off by default — your location is never shared
          from an audio detection without this opt-in.
        </Text>

        <Row label={`Detection sensitivity — ${sensitivityLabel(settings.sirenSensitivity)}`}>
          <Slider
            minimumValue={0.3}
            maximumValue={0.9}
            step={0.05}
            value={settings.sirenSensitivity}
            onSlidingComplete={onSensitivityChange}
            minimumTrackTintColor={colors.accent}
          />
        </Row>
      </Section>

      <Section title="Voice guidance">
        <Row label="Voice guidance on by default">
          <Switch
            value={settings.defaultVoiceEnabled}
            onValueChange={onDefaultVoiceToggle}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Row>
      </Section>

      <View style={styles.about}>
        <Image source={require("../../assets/icon.png")} style={styles.aboutLogo} />
        <Text style={styles.aboutName}>{Constants.expoConfig?.name ?? "TrackLine"}</Text>
        <Text style={styles.aboutVersion}>Version {Constants.expoConfig?.version ?? "1.0.0"}</Text>
        {BUSINESS_INFO.businessName ? (
          <Text style={styles.aboutMeta}>{BUSINESS_INFO.businessName}</Text>
        ) : null}
        {BUSINESS_INFO.abn ? <Text style={styles.aboutMeta}>ABN {BUSINESS_INFO.abn}</Text> : null}
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.xl, gap: spacing.xxl },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md + 2,
    ...shadow.low,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    gap: spacing.sm,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
  },
  helperText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  alertTypeGrid: {
    gap: spacing.sm,
  },
  alertTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  alertTypeLabel: {
    fontSize: 14,
    color: colors.text,
  },
  about: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  aboutLogo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    ...shadow.low,
  },
  aboutName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  aboutVersion: {
    fontSize: 12,
    color: colors.textFaint,
  },
  aboutMeta: {
    fontSize: 12,
    color: colors.textFaint,
  },
});
