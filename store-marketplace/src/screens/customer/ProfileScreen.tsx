import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "@/services/auth";
import { listMyMemberships } from "@/services/membership";
import { getBusiness } from "@/services/businesses";
import { getCategory } from "@/config/categories";
import type { Business, Membership } from "@/types";

export function ProfileScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [myBusinesses, setMyBusinesses] = useState<Array<{ business: Business; membership: Membership }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const memberships = await listMyMemberships(user.uid);
      const hydrated = await Promise.all(
        memberships.map(async (m) => {
          const business = await getBusiness(m.businessId);
          return business ? { business, membership: m } : null;
        })
      );
      if (!cancelled) {
        setMyBusinesses(hydrated.filter((x): x is { business: Business; membership: Membership } => x != null));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Profile</Text>
      <Text style={styles.name}>{user?.displayName || "Signed in"}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate("BusinessOnboarding")}>
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={styles.createButtonText}>Create your business</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>My businesses</Text>
      <FlatList
        data={myBusinesses}
        keyExtractor={(x) => x.business.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate("BusinessDashboard", { businessId: item.business.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.business.name}</Text>
              <Text style={styles.rowMeta}>
                {getCategory(item.business.categoryId).label} · {item.membership.role}
                {!item.business.isPublished ? " · Draft" : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>You don't own or work at any business yet.</Text>
          ) : null
        }
      />

      <TouchableOpacity style={styles.signOutButton} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", paddingTop: 60 },
  header: { color: "#fff", fontSize: 24, fontWeight: "700", paddingHorizontal: 16 },
  name: { color: "#fff", fontSize: 16, fontWeight: "600", paddingHorizontal: 16, marginTop: 12 },
  email: { color: "#9CA3AF", fontSize: 13, paddingHorizontal: 16, marginBottom: 16 },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4F46E5",
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 20,
  },
  createButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  sectionTitle: { color: "#9CA3AF", fontSize: 12, textTransform: "uppercase", paddingHorizontal: 16, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1F2937",
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  rowName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  rowMeta: { color: "#9CA3AF", fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  empty: { color: "#6B7280", textAlign: "center", marginTop: 12, paddingHorizontal: 32 },
  signOutButton: { marginHorizontal: 16, marginTop: "auto", marginBottom: 40, alignItems: "center", paddingVertical: 12 },
  signOutText: { color: "#F87171", fontSize: 14, fontWeight: "600" },
});
