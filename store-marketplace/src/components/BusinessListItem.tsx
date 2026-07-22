import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Business } from "@/types";
import { getCategory } from "@/config/categories";

interface Props {
  business: Business & { distanceKm?: number };
  onPress: () => void;
}

export function BusinessListItem({ business, onPress }: Props) {
  const category = getCategory(business.categoryId);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      {business.logoUrl ? (
        <Image source={{ uri: business.logoUrl }} style={styles.logo} />
      ) : (
        <View style={[styles.logo, styles.logoPlaceholder]}>
          <Ionicons name={category.icon as any} size={24} color="#818CF8" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {business.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {category.label}
          {typeof business.distanceKm === "number" ? ` · ${business.distanceKm.toFixed(1)} km` : ""}
        </Text>
        {business.verificationStatus === "verified" && (
          <View style={styles.verifiedRow}>
            <Ionicons name="checkmark-circle" size={14} color="#34D399" />
            <Text style={styles.verifiedText}>Verified business</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#6B7280" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  logo: { width: 48, height: 48, borderRadius: 10, backgroundColor: "#1F2937" },
  logoPlaceholder: { alignItems: "center", justifyContent: "center" },
  name: { color: "#fff", fontSize: 16, fontWeight: "600" },
  meta: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  verifiedText: { color: "#34D399", fontSize: 12 },
});
