import React, { useState, useCallback, useRef, useEffect } from "react";
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
import {
  getSearchHistory,
  addSearchHistoryEntry,
  removeSearchHistoryEntry,
  clearSearchHistory,
} from "@/services/searchHistory";
import type { LatLng } from "@/utils/polyline";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";

// Default collapsed count for "Recent searches" -- the dropdown toggle expands to the full
// stored history (see searchHistory.ts's own cap) and collapses back to this.
const COLLAPSED_HISTORY_COUNT = 3;

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
  // Deliberately NOT driven by TextInput focus state -- a blur fires the instant a history row
  // (or the old predictions list, which has the same shape of problem) is tapped, since the
  // tap itself moves focus off the input. Gating visibility on "is the input focused" would
  // unmount the row out from under the user's finger before the tap could register. Instead
  // this tracks "should the recent-searches panel be showing" as its own independent state,
  // exactly the same way the predictions list already only depends on predictions.length.
  const [historyVisible, setHistoryVisible] = useState(false);
  const [history, setHistory] = useState<PlaceDetails[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    getSearchHistory().then(setHistory);
  }, []);

  const dismissSearch = useCallback(() => {
    Keyboard.dismiss();
    setPredictions([]);
    setHistoryVisible(false);
  }, []);

  const onChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!text.trim()) {
        setPredictions([]);
        setErrorText(null);
        setHistoryVisible(true);
        return;
      }
      setHistoryVisible(false);
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

  const selectPlace = useCallback(
    (place: PlaceDetails) => {
      setQuery(place.name);
      setPredictions([]);
      Keyboard.dismiss();
      setHistoryVisible(false);
      addSearchHistoryEntry(place).then(setHistory);
      onDestinationSelected(place);
    },
    [onDestinationSelected]
  );

  const onSelectPrediction = useCallback(
    async (prediction: PlacePrediction) => {
      try {
        const details = await getPlaceDetails(prediction.placeId);
        selectPlace(details);
      } catch (err) {
        setErrorText(
          err instanceof PlacesApiError
            ? `Couldn't load that place (${err.status})`
            : "Couldn't load that place -- check your connection"
        );
      }
    },
    [selectPlace]
  );

  const onRemoveHistoryEntry = useCallback((placeId: string) => {
    removeSearchHistoryEntry(placeId).then((next) => {
      setHistory(next);
      if (next.length <= COLLAPSED_HISTORY_COUNT) setHistoryExpanded(false);
    });
  }, []);

  const onClearAllHistory = useCallback(() => {
    clearSearchHistory().then(() => {
      setHistory([]);
      setHistoryExpanded(false);
    });
  }, []);

  const showHistory = historyVisible && !query.trim() && predictions.length === 0 && history.length > 0;
  const visibleHistory = historyExpanded ? history : history.slice(0, COLLAPSED_HISTORY_COUNT);

  return (
    <>
      {/* Tapping the map while the keyboard/prediction dropdown is up used to do nothing --
          the keyboard just stayed open, blocking most of the screen with no obvious way out
          short of the keyboard's own dismiss key. Sits behind the search box in paint order
          (rendered first), so it only catches taps that land outside the box/dropdown, which
          keep working normally. Gated on whichever dropdown can actually be showing, not raw
          focus -- see historyVisible's own comment for why focus alone isn't the right signal. */}
      {(historyVisible || predictions.length > 0) && (
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissSearch} />
      )}
      <View style={[styles.container, { top: insets.top + spacing.md }]}>
        <View style={styles.inputRow}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={onChangeText}
            onFocus={() => {
              if (!query.trim()) setHistoryVisible(true);
            }}
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
        {showHistory && (
          <View style={styles.list}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyHeaderText}>Recent searches</Text>
              <View style={styles.historyHeaderActions}>
                <Pressable onPress={onClearAllHistory} hitSlop={8} accessibilityLabel="Clear all recent searches">
                  <Text style={styles.clearAllText}>Clear all</Text>
                </Pressable>
                {history.length > COLLAPSED_HISTORY_COUNT && (
                  <Pressable
                    onPress={() => setHistoryExpanded((v) => !v)}
                    hitSlop={8}
                    style={styles.dropdownButton}
                    accessibilityLabel={historyExpanded ? "Show fewer recent searches" : "Show all recent searches"}
                  >
                    <Ionicons name={historyExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>
            {visibleHistory.map((place) => (
              <View key={place.placeId} style={styles.row}>
                <Pressable style={styles.historyRowMain} onPress={() => selectPlace(place)}>
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.primaryText} numberOfLines={1}>
                      {place.name}
                    </Text>
                    {!!place.address && (
                      <Text style={styles.secondaryText} numberOfLines={1}>
                        {place.address}
                      </Text>
                    )}
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => onRemoveHistoryEntry(place.placeId)}
                  hitSlop={10}
                  style={styles.historyRemoveButton}
                  accessibilityLabel={`Remove ${place.name} from recent searches`}
                >
                  <Ionicons name="close" size={16} color={colors.textFaint} />
                </Pressable>
              </View>
            ))}
          </View>
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
    maxHeight: 320,
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
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  historyHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  historyHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
  },
  dropdownButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  historyRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  historyRemoveButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
