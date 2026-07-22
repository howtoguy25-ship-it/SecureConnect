import React, { useEffect, useState } from "react";
import { Alert, FlatList, Image, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { watchBusiness } from "@/services/businesses";
import { watchStock } from "@/services/stock";
import { watchAnnouncements } from "@/services/announcements";
import { followBusiness, unfollowBusiness, setFollowNotifyPrefs, watchFollow } from "@/services/follows";
import { getMembership } from "@/services/membership";
import { getCategory } from "@/config/categories";
import { StockItemCard } from "@/components/StockItemCard";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import type { Announcement, Business, Follow, StockItem } from "@/types";

type Props = NativeStackScreenProps<RootStackParamList, "StoreDetail">;

export function StoreDetailScreen({ route, navigation }: Props) {
  const { businessId } = route.params;
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [follow, setFollow] = useState<Follow | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [tab, setTab] = useState<"stock" | "announcements">("stock");

  useEffect(() => {
    const unsub = watchBusiness(businessId, (b) => {
      setBusiness(b);
      navigation.setOptions({ title: b?.name ?? "" });
    });
    return unsub;
  }, [businessId]);

  useEffect(() => watchStock(businessId, setStock), [businessId]);
  useEffect(() => watchAnnouncements(businessId, setAnnouncements), [businessId]);
  useEffect(() => {
    if (!user) return;
    return watchFollow(user.uid, businessId, setFollow);
  }, [user, businessId]);
  useEffect(() => {
    if (!user) return;
    getMembership(businessId, user.uid).then((m) => setIsTeamMember(!!m && m.status === "active"));
  }, [user, businessId]);

  if (!business) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading store...</Text>
      </View>
    );
  }

  const category = getCategory(business.categoryId);

  async function toggleFollow() {
    if (!user) return;
    try {
      if (follow) {
        await unfollowBusiness(user.uid, businessId);
      } else {
        await followBusiness(user.uid, businessId);
      }
    } catch (err) {
      Alert.alert("Something went wrong", err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleChannel(channel: keyof Follow["notify"]) {
    if (!user || !follow) return;
    await setFollowNotifyPrefs(user.uid, businessId, { [channel]: !follow.notify[channel] });
  }

  return (
    <View style={styles.container}>
      {business.coverImageUrl && <Image source={{ uri: business.coverImageUrl }} style={styles.cover} />}

      <View style={styles.headerBlock}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{business.name}</Text>
          <Text style={styles.category}>{category.label}</Text>
          <Text style={styles.address}>{business.address}</Text>
          {business.verificationStatus === "verified" && (
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={14} color="#34D399" />
              <Text style={styles.verifiedText}>Verified business</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {business.chatEnabled && (isTeamMember || !!follow) && (
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => navigation.navigate("StoreChat", { businessId })}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color="#818CF8" />
            </TouchableOpacity>
          )}
          {isTeamMember ? (
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => navigation.navigate("BusinessDashboard", { businessId })}
            >
              <Text style={styles.manageButtonText}>Manage</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.followButton, follow && styles.followingButton]} onPress={toggleFollow}>
              <Text style={styles.followButtonText}>{follow ? "Following" : "Follow"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {business.description ? <Text style={styles.description}>{business.description}</Text> : null}

      {follow && (
        <View style={styles.prefsBox}>
          <Text style={styles.prefsTitle}>Notify me about</Text>
          {(
            [
              ["announcements", "Announcements"],
              ["stockChanges", "Restocks & new items"],
              ["promotions", "Promotions"],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={styles.prefRow}>
              <Text style={styles.prefLabel}>{label}</Text>
              <Switch value={follow.notify[key]} onValueChange={() => toggleChannel(key)} />
            </View>
          ))}
        </View>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity onPress={() => setTab("stock")} style={[styles.tab, tab === "stock" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "stock" && styles.tabTextActive]}>{category.itemNounPlural}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("announcements")}
          style={[styles.tab, tab === "announcements" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "announcements" && styles.tabTextActive]}>Announcements</Text>
        </TouchableOpacity>
      </View>

      {tab === "stock" ? (
        <FlatList
          data={stock}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <StockItemCard item={item} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>No items published yet.</Text>}
        />
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <AnnouncementCard announcement={item} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>No announcements yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  loading: { color: "#9CA3AF", textAlign: "center", marginTop: 40 },
  cover: { width: "100%", height: 140 },
  headerBlock: { flexDirection: "row", padding: 16, alignItems: "flex-start" },
  name: { color: "#fff", fontSize: 20, fontWeight: "700" },
  category: { color: "#818CF8", fontSize: 13, marginTop: 2 },
  address: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  verifiedText: { color: "#34D399", fontSize: 12 },
  description: { color: "#D1D5DB", fontSize: 13, paddingHorizontal: 16, marginBottom: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatButton: {
    backgroundColor: "#1F2937",
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  followButton: { backgroundColor: "#4F46E5", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  followingButton: { backgroundColor: "#374151" },
  followButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  manageButton: { backgroundColor: "#1F2937", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  manageButtonText: { color: "#818CF8", fontWeight: "600", fontSize: 13 },
  prefsBox: { marginHorizontal: 16, marginBottom: 12, backgroundColor: "#1F2937", borderRadius: 12, padding: 14 },
  prefsTitle: { color: "#9CA3AF", fontSize: 12, marginBottom: 8, textTransform: "uppercase" },
  prefRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  prefLabel: { color: "#E5E7EB", fontSize: 14 },
  tabRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#1F2937" },
  tabActive: { backgroundColor: "#4F46E5" },
  tabText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { color: "#6B7280", textAlign: "center", marginTop: 24 },
});
