import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { watchMyNotifications, markNotificationRead } from "@/services/appNotifications";
import type { AppNotification } from "@/types";

function timeAgo(ms: number): string {
  const diffMin = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export function NotificationsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) return;
    return watchMyNotifications(user.uid, setItems);
  }, [user]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Notifications</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, !item.read && styles.unread]}
            onPress={() => {
              if (user) markNotificationRead(user.uid, item.id);
              navigation.navigate("StoreDetail", { businessId: item.businessId });
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.business}>{item.businessName}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body} numberOfLines={2}>
                {item.body}
              </Text>
            </View>
            <Text style={styles.time}>{typeof item.createdAt === "number" ? timeAgo(item.createdAt) : ""}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing yet. Follow stores and turn on notifications to hear about restocks and announcements.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", paddingTop: 60 },
  header: { color: "#fff", fontSize: 24, fontWeight: "700", paddingHorizontal: 16, marginBottom: 12 },
  row: {
    flexDirection: "row",
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#1F2937",
  },
  unread: { borderLeftWidth: 3, borderLeftColor: "#4F46E5" },
  business: { color: "#818CF8", fontSize: 11, textTransform: "uppercase", marginBottom: 2 },
  title: { color: "#fff", fontSize: 14, fontWeight: "600" },
  body: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  time: { color: "#6B7280", fontSize: 11, marginLeft: 8 },
  empty: { color: "#6B7280", textAlign: "center", marginTop: 40, paddingHorizontal: 32 },
});
