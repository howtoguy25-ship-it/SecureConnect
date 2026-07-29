import React, { useState, useCallback, useRef } from "react";
import { View, TextInput, FlatList, Text, Pressable, StyleSheet, ActivityIndicator, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  searchPlaces,
  getPlaceDetails,
  PlacesApiError,
  type PlacePrediction,
  type PlaceDetails,
} from "@/services/places";
import type { LatLng } from "@/utils/polyline";
import { colors, radius, shadow, spacing } from "@/theme/tokens";

interface Props {
  biasLocation?: LatLng;
  onDestinationSelected: (place: PlaceDetails) => void;
  placeholder?: string;
  // Only set when this bar is standing in for a secondary pick (e.g. "add a stop") that the
  // user should be able to back out of without having picked anything.
  onCancel?: () => void;
}

export function DestinationSearchBar({
  biasLocation,
  onDestinationSelected,
  placeholder = "Search destination",
  onCancel,
}: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const dismissSearch = useCallback(() => {
    Keyboard.dismiss();
    setPredictions([]);
  }, []);

  const onChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!text.trim()) {
        setPredictions([]);
        setErrorText(null);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        setErrorText(null);
        try {
          const results = await searchPlaces(text, biasLocation);
          setPredictions(results);
        } catch (err) {
          setPredictions([]);
          // Confirmed via direct testing that this app's Google API key returns the exact same
          // "You must enable Billing on the Google Cloud Project" error on every Maps Platform
          // call (Places, Directions, Street View alike) -- not a per-API restriction issue.
          // Surface that specific, actionable cause when it's what actually came back, instead
          // of a generic "check your key" guess that doesn't tell whoever owns the Google Cloud
          // project what to actually go do.
          setErrorText(
            err instanceof PlacesApiError
              ? /billing/i.test(err.message)
                ? "Search unavailable -- billing isn't enabled on this app's Google Cloud project"
                : `Search unavailable (${err.status}) -- check the Places API key`
              : "Search failed -- check your connection"
          );
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [biasLocation]
  );

  const onSelectPrediction = useCallback(
    async (prediction: PlacePrediction) => {
      try {
        const details = await getPlaceDetails(prediction.placeId);
        setQuery(details.name);
        setPredictions([]);
        onDestinationSelected(details);
      } catch (err) {
        setErrorText(
          err instanceof PlacesApiError
            ? `Couldn't load that place (${err.status})`
            : "Couldn't load that place -- check your connection"
        );
      }
    },
    [onDestinationSelected]
  );

  return (
    <>
      {/* Tapping the map while the keyboard/prediction dropdown is up used to do nothing --
          the keyboard just stayed open, blocking most of the screen with no obvious way out
          short of the keyboard's own dismiss key. Sits behind the search box in paint order
          (rendered first), so it only catches taps that land outside the box/dropdown, which
          keep working normally. */}
      {isFocused && <Pressable style={StyleSheet.absoluteFill} onPress={dismissSearch} />}
      <View style={[styles.container, { top: insets.top + spacing.md }]}>
        <View style={styles.inputRow}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={onChangeText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          {loading && <ActivityIndicator size="small" color={colors.accent} />}
          {onCancel && (
            <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Cancel">
              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
            </Pressable>
          )}
        </View>
        {errorText && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{errorText}</Text>
          </View>
        )}
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
    </>
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
  errorBanner: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#FEF2F2",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...shadow.low,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
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
