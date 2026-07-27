import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import {
  RINGTONE_OPTIONS,
  getSelectedRingtoneId,
  setSelectedRingtoneId,
  playRingtonePreview,
  stopPreview,
} from "@/utils/ringtone";
import { haptics } from "@/lib/haptics";

export default function RingtoneScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const [selectedId, setSelectedId] = useState("default");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    getSelectedRingtoneId().then(setSelectedId);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        stopPreview();
        setPlayingId(null);
      };
    }, [])
  );

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    await setSelectedRingtoneId(id);
    haptics.light();
  };

  const handlePreview = async (id: string) => {
    if (playingId === id) {
      stopPreview();
      setPlayingId(null);
      return;
    }
    setPlayingId(id);
    await playRingtonePreview(id);
    setTimeout(() => {
      setPlayingId((current) => (current === id ? null : current));
    }, 3100);
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        INCOMING CALL RINGTONE
      </ThemedText>
      <ThemedText type="small" style={[styles.description, { color: theme.textSecondary }]}>
        Choose the sound that plays when you receive an incoming call. Tap the play button to preview.
      </ThemedText>

      <View style={styles.list}>
        {RINGTONE_OPTIONS.map((ringtone) => {
          const isSelected = selectedId === ringtone.id;
          const isCurrentlyPlaying = playingId === ringtone.id;

          return (
            <View
              key={ringtone.id}
              style={[
                styles.ringtoneItem,
                {
                  backgroundColor: isSelected
                    ? Platform.OS === "ios"
                      ? theme.primary + "18"
                      : theme.primary + "15"
                    : theme.backgroundDefault,
                  borderColor: isSelected ? theme.primary : "transparent",
                  borderWidth: isSelected ? 1.5 : 1,
                },
              ]}
            >
              <Pressable
                style={styles.ringtoneInfo}
                onPress={() => handleSelect(ringtone.id)}
              >
                <View
                  style={[
                    styles.radioOuter,
                    {
                      borderColor: isSelected ? theme.primary : theme.textSecondary,
                    },
                  ]}
                >
                  {isSelected ? (
                    <View
                      style={[styles.radioInner, { backgroundColor: theme.primary }]}
                    />
                  ) : null}
                </View>
                <ThemedText
                  type="body"
                  style={[
                    styles.ringtoneName,
                    isSelected ? { fontWeight: "600", color: theme.primary } : {},
                  ]}
                >
                  {ringtone.name}
                </ThemedText>
              </Pressable>

              <Pressable
                style={[
                  styles.playButton,
                  {
                    backgroundColor: isCurrentlyPlaying
                      ? theme.primary
                      : theme.backgroundSecondary,
                  },
                ]}
                onPress={() => handlePreview(ringtone.id)}
                hitSlop={8}
              >
                <Feather
                  name={isCurrentlyPlaying ? "pause" : "play"}
                  size={16}
                  color={isCurrentlyPlaying ? "#fff" : theme.text}
                />
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="info" size={16} color={theme.textSecondary} />
        <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
          Your ringtone preference is saved on this device. It will play through the speaker even when your phone is on silent.
        </ThemedText>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
    marginLeft: Spacing.sm,
    fontWeight: "600",
  },
  description: {
    marginBottom: Spacing.lg,
    marginLeft: Spacing.sm,
    lineHeight: 18,
  },
  list: {
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  ringtoneItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  ringtoneInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
    paddingVertical: Spacing.xs,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ringtoneName: {
    flex: 1,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
});
