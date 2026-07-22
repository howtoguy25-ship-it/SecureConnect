import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { watchMyFollows } from "@/services/follows";
import { getBusiness } from "@/services/businesses";
import { BusinessListItem } from "@/components/BusinessListItem";
import type { Business } from "@/types";

export function FollowedStoresScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [businesses, setBusinesses] = useState<Business[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = watchMyFollows(user.uid, async (follows) => {
      const hydrated = await Promise.all(follows.map((f) => getBusiness(f.businessId)));
      setBusinesses(hydrated.filter((b): b is Business => b != null));
    });
    return unsub;
  }, [user]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Following</Text>
      <FlatList
        data={businesses}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <BusinessListItem business={item} onPress={() => navigation.navigate("StoreDetail", { businessId: item.id })} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Follow stores from Discover to see their live stock and updates here.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", paddingTop: 60 },
  header: { color: "#fff", fontSize: 24, fontWeight: "700", paddingHorizontal: 16, marginBottom: 12 },
  empty: { color: "#6B7280", textAlign: "center", marginTop: 40, paddingHorizontal: 32 },
});
