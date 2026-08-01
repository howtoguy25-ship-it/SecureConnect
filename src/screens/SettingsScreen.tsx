import React, { useCallback } from "react";
import { View, Text, Image, StyleSheet, Switch, ScrollView, Pressable } from "react-native";
import Slider from "@react-native-community/slider";
import Constants from "expo-constants";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { syncAlertRadiusToProfile } from "@/services/userProfile";
import { setVoiceEnabled } from "@/services/voice";
import { signOutUser } from "@/services/firebase";
import { BUSINESS_INFO } from "@/config/business";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import { ALL_ALERT_TYPES, DEFAULT_ALERT_RADIUS_KM } from "@/services/settings";
import { ALERT_LABELS, type AlertType } from "@/types/alert";
import { MAP_THEME_LABELS, type MapThemeKey } from "@/utils/mapStyle";
import { TRAFFIC_LIGHT_MARKER, SPEED_CAMERA_MARKER } from "@/utils/osmMarkerStyle";
import type { RootStackParamList } from "@/navigation/RootNavigator";

function sensitivityLabel(value: number): string {
  if (value <= 0.4) return "Low";
  if (value <= 0.7) return "Medium";
  return "High";
}

// Small background/highway-accent pair per theme, just for the picker swatches below -- the
// real, full styling lives in utils/mapStyle.ts; this is only a preview.
const MAP_THEME_ORDER: MapThemeKey[] = ["normal", "purpleBlue", "blueGrey", "greenYellow"];
const MAP_THEME_SWATCH_COLORS: Record<MapThemeKey, [string, string]> = {
  normal: ["#14201a", "#34d976"],
  purpleBlue: ["#1a1033", "#8b7cf6"],
  blueGrey: ["#232a35", "#5b9bf0"],
  greenYellow: ["#0f2417", "#facc15"],
};

export function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Every device is signed in anonymously from launch (see firebase.ts's ensureSignedIn) --
  // isAnonymous is the real signal for "hasn't actually signed in with an identity yet",
  // not just user being null/non-null.
  const isSignedIn = !!user && !user.isAnonymous;

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

  const onOsmRadiusChange = useCallback(
    (value: number) => updateSettings({ osmLayerRadiusKm: Math.round(value) }),
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

  const onMapThemeSelect = useCallback(
    (theme: MapThemeKey) => updateSettings({ mapTheme: theme }),
    [updateSettings]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="Account">
        {isSignedIn ? (
          <>
            <Text style={styles.rowLabel}>Signed in as {user.email ?? user.displayName ?? "you"}</Text>
            <Pressable
              style={({ pressed }) => [styles.signOutButton, pressed && { opacity: pressedOpacity }]}
              onPress={() => signOutUser()}
            >
              <Text style={styles.signOutButtonText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.helperText}>
              Not signed in -- everything still works. Sign in to make your reports and settings
              recoverable if you get a new phone.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.signInButton, pressed && { opacity: pressedOpacity }]}
              onPress={() => navigation.navigate("SignIn")}
            >
              <Text style={styles.signInButtonText}>Sign in</Text>
            </Pressable>
          </>
        )}
      </Section>

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

      <Section title="Map appearance">
        <Text style={styles.helperText}>
          Recolors the whole map -- land, water, roads, and highways together -- not just a
          tint. Every theme keeps road labels high-contrast against the road surface so street
          names stay easy to read while driving.
        </Text>
        <View style={styles.themeGrid}>
          {MAP_THEME_ORDER.map((theme) => {
            const isSelected = settings.mapTheme === theme;
            const [bg, accent] = MAP_THEME_SWATCH_COLORS[theme];
            return (
              <Pressable
                key={theme}
                onPress={() => onMapThemeSelect(theme)}
                style={({ pressed }) => [
                  styles.themeTile,
                  isSelected && styles.themeTileSelected,
                  pressed && { opacity: pressedOpacity },
                ]}
                accessibilityLabel={`${MAP_THEME_LABELS[theme]} map theme`}
              >
                <View style={[styles.themeSwatch, { backgroundColor: bg }]}>
                  <View style={[styles.themeSwatchAccent, { backgroundColor: accent }]} />
                </View>
                <Text style={[styles.themeTileLabel, isSelected && styles.themeTileLabelSelected]}>
                  {MAP_THEME_LABELS[theme]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Map layers">
        <Row
          label="Traffic lights"
          icon={<OsmLayerIcon marker={TRAFFIC_LIGHT_MARKER} enabled={settings.showTrafficLights} />}
        >
          <Switch
            value={settings.showTrafficLights}
            onValueChange={onShowTrafficLightsToggle}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Row>
        <Row
          label="Speed cameras"
          icon={<OsmLayerIcon marker={SPEED_CAMERA_MARKER} enabled={settings.showSpeedCameras} />}
        >
          <Switch
            value={settings.showSpeedCameras}
            onValueChange={onShowSpeedCamerasToggle}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Row>
        <Row label={`Traffic light & speed camera radius — ${settings.osmLayerRadiusKm} km`}>
          <Slider
            minimumValue={1}
            maximumValue={200}
            step={1}
            value={settings.osmLayerRadiusKm}
            onSlidingComplete={onOsmRadiusChange}
            disabled={!settings.showTrafficLights && !settings.showSpeedCameras}
            minimumTrackTintColor={colors.accent}
          />
        </Row>
        <Text style={styles.helperText}>
          Every known traffic light and fixed speed camera location, mapped by OpenStreetMap's
          community — shown independently on the map, whether or not "Live alerts" is on, out to
          however far from your own location the radius above is set (1-200 km).
        </Text>
      </Section>

      <Section title="Public transit">
        <View style={styles.warningBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.warningText}>
            Live, real-time bus/train tracking is limited to NSW, Australia.
          </Text>
        </View>
        <Text style={styles.helperText}>
          Everywhere else — and for anything NSW's live feed doesn't cover — tapping Transit
          still finds real nearby buses and trains to wherever you're headed, using published
          timetables (the real line, real stop, and real scheduled departure time, just not a
          live-tracked vehicle position).
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

function Row({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabelWrap}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

// Same icon/color the map pin itself uses (see osmMarkerStyle.ts) -- muted to grey while the
// layer is off, full color once it's on, so the toggle visually previews what you're about to
// see on the map instead of a plain, unrelated on/off switch.
function OsmLayerIcon({
  marker,
  enabled,
}: {
  marker: { icon: string; color: string; badgeSize: number; glyphSize: number };
  enabled: boolean;
}) {
  const size = Math.max(marker.badgeSize, 22);
  return (
    <View
      style={[
        styles.rowIconBadge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: enabled ? marker.color : colors.border },
      ]}
    >
      <MaterialCommunityIcons name={marker.icon as any} size={marker.glyphSize} color="#FFFFFF" />
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
  rowLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowIconBadge: {
    alignItems: "center",
    justifyContent: "center",
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
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "#FEF3C7",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
    lineHeight: 18,
  },
  signInButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    alignItems: "center",
  },
  signInButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  signOutButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    alignItems: "center",
  },
  signOutButtonText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 14,
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  themeTile: {
    width: "47%",
    alignItems: "center",
    gap: spacing.xs + 2,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  themeTileSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceMuted,
  },
  themeSwatch: {
    width: "100%",
    height: 44,
    borderRadius: radius.sm,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  themeSwatchAccent: {
    height: 12,
    width: "60%",
    alignSelf: "center",
    marginBottom: 8,
    borderRadius: 3,
  },
  themeTileLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  themeTileLabelSelected: {
    color: colors.accent,
    fontWeight: "700",
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
