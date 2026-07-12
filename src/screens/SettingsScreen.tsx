import React, { useCallback } from "react";
import { View, Text, Image, StyleSheet, Switch, ScrollView } from "react-native";
import Slider from "@react-native-community/slider";
import Constants from "expo-constants";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { syncAlertRadiusToProfile } from "@/services/userProfile";
import { setVoiceEnabled } from "@/services/voice";
import { BUSINESS_INFO } from "@/config/business";

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
      <Section title="Alerts">
        <Row label={`Alert visibility radius — ${settings.alertRadiusKm} km`}>
          <Slider
            minimumValue={1}
            maximumValue={15}
            step={1}
            value={settings.alertRadiusKm}
            onSlidingComplete={onRadiusChange}
            minimumTrackTintColor="#2563EB"
          />
        </Row>
      </Section>

      <Section title="EV Radar (siren detection)">
        <Row label="Auto-share detections">
          <Switch value={settings.autoShareDetections} onValueChange={onAutoShareToggle} />
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
            minimumTrackTintColor="#2563EB"
          />
        </Row>
      </Section>

      <Section title="Voice guidance">
        <Row label="Voice guidance on by default">
          <Switch value={settings.defaultVoiceEnabled} onValueChange={onDefaultVoiceToggle} />
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
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 20, gap: 24 },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    gap: 8,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  helperText: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
  },
  about: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
  },
  aboutLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginBottom: 6,
  },
  aboutName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  aboutVersion: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  aboutMeta: {
    fontSize: 12,
    color: "#9CA3AF",
  },
});
