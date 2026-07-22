import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useLocation } from "@/context/LocationContext";
import { searchBusinessesByName, searchBusinessesNearby } from "@/services/businesses";
import { CATEGORIES, getCategory } from "@/config/categories";
import { BusinessListItem } from "@/components/BusinessListItem";
import type { Business } from "@/types";

const NEARBY_RADIUS_KM = 15;

export function DiscoverScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { location, errorMsg } = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [results, setResults] = useState<Array<Business & { distanceKm?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const loadNearby = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    try {
      const nearby = await searchBusinessesNearby(
        { lat: location.coords.latitude, lng: location.coords.longitude },
        NEARBY_RADIUS_KM,
        categoryFilter ?? undefined
      );
      setResults(nearby);
    } catch (err) {
      console.warn("[discover] nearby search failed", err);
    } finally {
      setLoading(false);
    }
  }, [location, categoryFilter]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      loadNearby();
    }
  }, [loadNearby, searchTerm]);

  async function handleSearch(term: string) {
    setSearchTerm(term);
    if (!term.trim()) return;
    setLoading(true);
    try {
      const found = await searchBusinessesByName(term);
      setResults(categoryFilter ? found.filter((b) => b.categoryId === categoryFilter) : found);
    } catch (err) {
      console.warn("[discover] name search failed", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Discover stores</Text>
        <TouchableOpacity
          style={styles.viewToggle}
          onPress={() => setViewMode(viewMode === "list" ? "map" : "list")}
        >
          <Ionicons name={viewMode === "list" ? "map-outline" : "list-outline"} size={16} color="#818CF8" />
          <Text style={styles.viewToggleText}>{viewMode === "list" ? "Map" : "List"}</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.search}
        placeholder="Search stores by name..."
        placeholderTextColor="#6B7280"
        value={searchTerm}
        onChangeText={handleSearch}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
        <TouchableOpacity
          style={[styles.chip, !categoryFilter && styles.chipActive]}
          onPress={() => setCategoryFilter(null)}
        >
          <Text style={[styles.chipText, !categoryFilter && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.chip, categoryFilter === c.id && styles.chipActive]}
            onPress={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
          >
            <Text style={[styles.chipText, categoryFilter === c.id && styles.chipTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!searchTerm.trim() && errorMsg && <Text style={styles.notice}>{errorMsg}</Text>}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#4F46E5" />
      ) : viewMode === "map" ? (
        // initialRegion is read once on mount, not on every prop change -- remounting via
        // `key` when the result set size changes (e.g. switching category, new search) is
        // what recenters the map instead of it being stuck on wherever it first opened.
        <MapView
          key={results.length}
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          initialRegion={{
            latitude: location?.coords.latitude ?? results[0]?.location.lat ?? 0,
            longitude: location?.coords.longitude ?? results[0]?.location.lng ?? 0,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }}
        >
          {results.map((business) => (
            <Marker
              key={business.id}
              coordinate={{ latitude: business.location.lat, longitude: business.location.lng }}
              title={business.name}
              description={getCategory(business.categoryId).label}
              onPress={() => navigation.navigate("StoreDetail", { businessId: business.id })}
            />
          ))}
        </MapView>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BusinessListItem
              business={item}
              onPress={() => navigation.navigate("StoreDetail", { businessId: item.id })}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {searchTerm.trim() ? "No stores match that name." : "No published stores nearby yet."}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", paddingTop: 60 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  header: { color: "#fff", fontSize: 24, fontWeight: "700" },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1F2937",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewToggleText: { color: "#818CF8", fontSize: 12, fontWeight: "600" },
  map: { flex: 1 },
  search: {
    marginHorizontal: 16,
    backgroundColor: "#1F2937",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  chipsRow: { paddingHorizontal: 16, marginBottom: 12, flexGrow: 0 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1F2937",
    marginRight: 8,
  },
  chipActive: { backgroundColor: "#4F46E5" },
  chipText: { color: "#9CA3AF", fontSize: 13 },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  notice: { color: "#FBBF24", paddingHorizontal: 16, marginBottom: 8, fontSize: 13 },
  empty: { color: "#6B7280", textAlign: "center", marginTop: 40 },
});
