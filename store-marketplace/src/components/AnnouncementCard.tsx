import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Announcement } from "@/types";

const TYPE_ICON: Record<Announcement["type"], keyof typeof Ionicons.glyphMap> = {
  general: "megaphone-outline",
  new_item: "sparkles-outline",
  promotion: "pricetag-outline",
  stock_update: "cube-outline",
};

export function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={TYPE_ICON[announcement.type]} size={18} color="#818CF8" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{announcement.title}</Text>
          {announcement.pinned && <Ionicons name="pin" size={14} color="#FBBF24" />}
        </View>
        <Text style={styles.body}>{announcement.body}</Text>
        <Text style={styles.author}>— {announcement.authorName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    backgroundColor: "#1F2937",
    borderRadius: 12,
    marginBottom: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: "#fff", fontSize: 15, fontWeight: "600" },
  body: { color: "#D1D5DB", fontSize: 13, marginTop: 4 },
  author: { color: "#6B7280", fontSize: 11, marginTop: 6 },
});
