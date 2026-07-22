import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import type { StockItem } from "@/types";

const STATUS_LABEL: Record<StockItem["stockStatus"], string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  coming_soon: "Coming soon",
};

const STATUS_COLOR: Record<StockItem["stockStatus"], string> = {
  in_stock: "#34D399",
  low_stock: "#FBBF24",
  out_of_stock: "#F87171",
  coming_soon: "#818CF8",
};

interface Props {
  item: StockItem;
  rightAction?: React.ReactNode;
}

export function StockItemCard({ item, rightAction }: Props) {
  return (
    <View style={styles.card}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {item.price != null && <Text style={styles.price}>${item.price.toFixed(2)}</Text>}
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: STATUS_COLOR[item.stockStatus] }]} />
          <Text style={[styles.status, { color: STATUS_COLOR[item.stockStatus] }]}>
            {STATUS_LABEL[item.stockStatus]}
          </Text>
        </View>
        {Object.entries(item.fields || {})
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Text key={k} style={styles.fieldLine} numberOfLines={1}>
              {v}
            </Text>
          ))}
      </View>
      {rightAction}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    backgroundColor: "#1F2937",
    borderRadius: 12,
    marginBottom: 10,
  },
  image: { width: 56, height: 56, borderRadius: 8 },
  imagePlaceholder: { backgroundColor: "#374151" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: "#fff", fontSize: 15, fontWeight: "600", flexShrink: 1 },
  price: { color: "#E5E7EB", fontSize: 14, fontWeight: "600" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 12, fontWeight: "600" },
  fieldLine: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
});
