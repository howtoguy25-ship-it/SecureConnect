import React, { useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { watchBusiness, publishBusiness, unpublishBusiness } from "@/services/businesses";
import { watchStock, deleteStockItem } from "@/services/stock";
import { watchAnnouncements, deleteAnnouncement } from "@/services/announcements";
import { getMembership } from "@/services/membership";
import { getCategory } from "@/config/categories";
import { StockItemCard } from "@/components/StockItemCard";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import type { Announcement, Business, BusinessVisibility, Membership, StockItem } from "@/types";

type Props = NativeStackScreenProps<RootStackParamList, "BusinessDashboard">;

const VISIBILITY_OPTIONS: Array<{ value: BusinessVisibility; label: string; description: string }> = [
  { value: "public", label: "Public", description: "Listed on the homepage for anyone to find and follow" },
  { value: "team", label: "Team only", description: "Visible only to your team members" },
  { value: "private", label: "Private", description: "Hidden from everyone but you (draft mode)" },
];

export function BusinessDashboardScreen({ route, navigation }: Props) {
  const { businessId } = route.params;
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tab, setTab] = useState<"stock" | "announcements">("stock");

  useEffect(() => watchBusiness(businessId, setBusiness), [businessId]);
  useEffect(() => watchStock(businessId, setStock), [businessId]);
  useEffect(() => watchAnnouncements(businessId, setAnnouncements), [businessId]);
  useEffect(() => {
    if (!user) return;
    getMembership(businessId, user.uid).then(setMembership);
  }, [user, businessId]);

  if (!business) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  const category = getCategory(business.categoryId);
  const canEditStock = membership?.permissions.canEditStock ?? false;
  const canPost = membership?.permissions.canPostAnnouncements ?? false;
  const canManageTeam = membership?.permissions.canManageTeam ?? false;

  async function handleVisibilityChange(v: BusinessVisibility) {
    try {
      if (v === "private") await unpublishBusiness(businessId);
      else await publishBusiness(businessId, v);
    } catch (err) {
      Alert.alert("Couldn't update visibility", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{business.name}</Text>
          <Text style={styles.meta}>
            {category.label} · {business.followerCount} follower{business.followerCount === 1 ? "" : "s"}
          </Text>
        </View>
        {canManageTeam && (
          <TouchableOpacity onPress={() => navigation.navigate("TeamManagement", { businessId })}>
            <Ionicons name="people-outline" size={22} color="#818CF8" />
          </TouchableOpacity>
        )}
      </View>

      {business.verificationStatus !== "verified" && (
        <TouchableOpacity
          style={styles.verifyBanner}
          onPress={() => navigation.navigate("BusinessVerification", { businessId })}
        >
          <Ionicons name="shield-checkmark-outline" size={16} color="#FBBF24" />
          <Text style={styles.verifyBannerText}>
            {business.verificationStatus === "pending" ? "Verification pending -- tap for details" : "Verify your business"}
          </Text>
        </TouchableOpacity>
      )}

      {canManageTeam && (
        <View style={styles.visibilityRow}>
          {VISIBILITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.visibilityChip, business.visibility === opt.value && styles.visibilityChipActive]}
              onPress={() => handleVisibilityChange(opt.value)}
            >
              <Text style={[styles.visibilityChipText, business.visibility === opt.value && styles.visibilityChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity onPress={() => setTab("stock")} style={[styles.tab, tab === "stock" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "stock" && styles.tabTextActive]}>{category.itemNounPlural}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("announcements")} style={[styles.tab, tab === "announcements" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "announcements" && styles.tabTextActive]}>Announcements</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {tab === "stock" && canEditStock && (
          <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate("StockEditor", { businessId })}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        )}
        {tab === "announcements" && canPost && (
          <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate("AnnouncementComposer", { businessId })}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {tab === "stock" ? (
        <FlatList
          data={stock}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              disabled={!canEditStock}
              onPress={() => navigation.navigate("StockEditor", { businessId, itemId: item.id })}
              onLongPress={() =>
                canEditStock &&
                Alert.alert("Delete item?", item.name, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteStockItem(businessId, item.id) },
                ])
              }
            >
              <StockItemCard item={item} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No items yet. Add your first one.</Text>}
        />
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              onLongPress={() =>
                canPost &&
                Alert.alert("Delete announcement?", item.title, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteAnnouncement(businessId, item.id) },
                ])
              }
            >
              <AnnouncementCard announcement={item} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No announcements yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  loading: { color: "#9CA3AF", textAlign: "center", marginTop: 40 },
  headerBlock: { flexDirection: "row", alignItems: "center", padding: 16 },
  name: { color: "#fff", fontSize: 20, fontWeight: "700" },
  meta: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
  verifyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#1F2937",
    borderRadius: 10,
    padding: 12,
  },
  verifyBannerText: { color: "#FBBF24", fontSize: 13, flexShrink: 1 },
  visibilityRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  visibilityChip: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: "#1F2937", alignItems: "center" },
  visibilityChipActive: { backgroundColor: "#4F46E5" },
  visibilityChipText: { color: "#9CA3AF", fontSize: 12, fontWeight: "600" },
  visibilityChipTextActive: { color: "#fff" },
  tabRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#1F2937" },
  tabActive: { backgroundColor: "#4F46E5" },
  tabText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  addButton: { backgroundColor: "#4F46E5", borderRadius: 16, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { color: "#6B7280", textAlign: "center", marginTop: 24 },
});
