import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, Alert } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  getVehicleHistory,
  clearVehicleHistory,
  removeVehicleHistoryEntry,
  type VehicleHistoryEntry,
} from "@/services/vehicleHistory";
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

function speedLabel(entry: VehicleHistoryEntry): string | null {
  if (entry.lastSpeedKmh === null) return null;
  return entry.lastSpeedKind === "closing"
    ? `${Math.round(Math.abs(entry.lastSpeedKmh))} km/h closing`
    : `${Math.max(0, Math.round(entry.lastSpeedKmh))} km/h`;
}

// Every vehicle the live AI detector has fully identified (a real, confirmed on-device plate
// read -- see vehicleHistory.ts) is automatically logged here, per explicit request -- nothing
// to tap or save manually for those. This screen just surfaces that log and is the entry point
// into a real REV check for any of them, plus a manual "enter a plate" path for one that was
// never seen by the camera at all.
export function VehicleHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [entries, setEntries] = useState<VehicleHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    getVehicleHistory().then((list) => {
      setEntries(list);
      setLoaded(true);
    });
  }, []);

  // Refreshes every time this screen comes back into focus -- e.g. after running a REV check
  // (which records a manual entry) and tapping back, so the list is never stale.
  useFocusEffect(reload);

  const onOpenRevCheck = useCallback(
    (entry: VehicleHistoryEntry) => {
      navigation.navigate("RevCheck", {
        plate: entry.plate,
        state: entry.state ?? undefined,
        vehicleLabel: entry.label,
        speedKmh: entry.lastSpeedKmh,
        speedKind: entry.lastSpeedKind,
      });
    },
    [navigation]
  );

  const onRemove = useCallback(
    (plate: string) => {
      Alert.alert("Remove from history?", plate, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeVehicleHistoryEntry(plate).then(setEntries),
        },
      ]);
    },
    []
  );

  const onClearAll = useCallback(() => {
    if (entries.length === 0) return;
    Alert.alert("Clear all vehicle history?", "This removes every saved plate from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear all",
        style: "destructive",
        onPress: () => clearVehicleHistory().then(() => setEntries([])),
      },
    ]);
  }, [entries.length]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => navigation.navigate("RevCheck", undefined)}
        style={({ pressed }) => [styles.addButton, pressed && { opacity: pressedOpacity }]}
      >
        <Ionicons name="add-circle" size={20} color="#FFFFFF" />
        <Text style={styles.addButtonText}>Enter a plate manually</Text>
      </Pressable>

      {loaded && entries.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="car-search-outline" size={40} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>No vehicles yet</Text>
          <Text style={styles.emptyText}>
            Vehicles the AI detector fully identifies (a confirmed number plate read) are
            automatically saved here, or enter one manually above.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.plate}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const speed = speedLabel(item);
            return (
              <Pressable
                onPress={() => onOpenRevCheck(item)}
                onLongPress={() => onRemove(item.plate)}
                style={({ pressed }) => [styles.row, pressed && { opacity: pressedOpacity }]}
              >
                <View style={styles.plateBadge}>
                  <Text style={styles.plateBadgeText}>{item.plate}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowMeta}>
                    {item.label}
                    {item.source === "detected" ? " — AI detected" : " — manual entry"}
                    {item.timesSeen > 1 ? ` · seen ${item.timesSeen}x` : ""}
                  </Text>
                  <Text style={styles.rowMetaFaint}>
                    {speed ? `${speed} · ` : ""}
                    Last seen {relativeTime(item.lastSeenAt)}
                    {item.state ? ` · ${item.state}` : ""}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>
            );
          }}
        />
      )}

      {entries.length > 0 && (
        <Pressable
          onPress={onClearAll}
          style={({ pressed }) => [styles.clearButton, pressed && { opacity: pressedOpacity }]}
        >
          <Text style={styles.clearButtonText}>Clear all history</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, padding: spacing.xl, gap: spacing.md },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    height: 48,
    ...shadow.low,
  },
  addButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  list: { gap: spacing.sm, paddingBottom: spacing.xxl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.low,
  },
  plateBadge: {
    backgroundColor: colors.dark,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm - 2,
  },
  plateBadgeText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowMeta: { fontSize: 13, fontWeight: "600", color: colors.text },
  rowMetaFaint: { fontSize: 12, color: colors.textMuted },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
  clearButton: { alignItems: "center", paddingVertical: spacing.sm },
  clearButtonText: { fontSize: 13, fontWeight: "600", color: colors.danger },
});
