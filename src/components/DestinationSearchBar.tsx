import React, { useState, useCallback, useRef } from "react";
import { View, TextInput, FlatList, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { searchPlaces, getPlaceDetails, type PlacePrediction, type PlaceDetails } from "@/services/places";
import type { LatLng } from "@/utils/polyline";

interface Props {
  biasLocation?: LatLng;
  onDestinationSelected: (place: PlaceDetails) => void;
}

export function DestinationSearchBar({ biasLocation, onDestinationSelected }: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={18} color="#6B7280" />
        <TextInput
          value={query}
          onChangeText={onChangeText}
          placeholder="Search destination"
          placeholderTextColor="#9CA3AF"
          style={styles.input}
        />
        {loading && <ActivityIndicator size="small" />}
      </View>
      {predictions.length > 0 && (
        <FlatList
          data={predictions}
          keyExtractor={(item) => item.placeId}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelectPrediction(item)}>
              <Ionicons name="location-outline" size={16} color="#6B7280" />
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
    top: 56,
    left: 12,
    right: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  list: {
    marginTop: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    maxHeight: 260,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  primaryText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },
  secondaryText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
});
