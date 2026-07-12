import React, { useState, useCallback, useRef } from "react";
import { View, TextInput, FlatList, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { searchPlaces, getPlaceDetails, type PlacePrediction, type PlaceDetails } from "@/services/places";
import type { LatLng } from "@/utils/polyline";
import { colors, radius, shadow, spacing } from "@/theme/tokens";

interface Props {
  biasLocation?: LatLng;
  onDestinationSelected: (place: PlaceDetails) => void;
}

export function DestinationSearchBar({ biasLocation, onDestinationSelected }: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const onChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!text.trim()) {
        setPredictions([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const results = await searchPlaces(text, biasLocation);
          setPredictions(results);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [biasLocation]
  );

  const onSelectPrediction = useCallback(
    async (prediction: PlacePrediction) => {
      const details = await getPlaceDetails(prediction.placeId);
      setQuery(details.name);
      setPredictions([]);
      onDestinationSelected(details);
    },
    [onDestinationSelected]
  );

  return (
    <View style={[styles.container, { top: insets.top + spacing.md }]}>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={onChangeText}
          placeholder="Search destination"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
        {loading && <ActivityIndicator size="small" color={colors.accent} />}
      </View>
      {predictions.length > 0 && (
        <FlatList
          data={predictions}
          keyExtractor={(item) => item.placeId}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onSelectPrediction(item)}
            >
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.primaryText}>{item.primaryText}</Text>
                {!!item.secondaryText && <Text style={styles.secondaryText}>{item.secondaryText}</Text>}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
    ...shadow.low,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  list: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    maxHeight: 260,
    ...shadow.low,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  primaryText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "500",
  },
  secondaryText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
