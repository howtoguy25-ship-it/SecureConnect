import React, { useEffect, useMemo, useState, useLayoutEffect } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert, TextInput } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { HeaderButton } from "@react-navigation/elements";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { haptics } from "@/lib/haptics";

type Nav = NativeStackNavigationProp<RootStackParamList, "StoryContactPicker">;
type R = RouteProp<RootStackParamList, "StoryContactPicker">;

interface Contact {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export default function StoryContactPickerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const kind = route.params?.kind ?? "except";
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth() as any;

  const initial: string[] =
    (kind === "except" ? user?.storyPrivacyExceptIds : user?.storyPrivacyOnlyIds) ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/friends"],
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => (c.displayName || "").toLowerCase().includes(q));
  }, [contacts, query]);

  const toggle = (id: string) => {
    haptics.selection?.();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const token = await getStoredToken();
      const body =
        kind === "except"
          ? { storyPrivacyExceptIds: Array.from(selected) }
          : { storyPrivacyOnlyIds: Array.from(selected) };
      const res = await fetch(new URL("/api/users/me/story-privacy", getApiUrl()), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save failed");
      if (refreshUser) await refreshUser();
      haptics.light();
      navigation.goBack();
    } catch {
      Alert.alert("Error", "Couldn't save your selection.");
    } finally {
      setSaving(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: kind === "except" ? "Hide Story From" : "Share Story With",
      headerRight: () => (
        <HeaderButton onPress={onSave} disabled={saving}>
          <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>Save</ThemedText>
        </HeaderButton>
      ),
    });
  }, [navigation, kind, saving, selected, theme.primary]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      <View style={[styles.searchBar, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search contacts"
          placeholderTextColor={theme.textSecondary}
          style={{ flex: 1, color: theme.text, marginLeft: Spacing.sm }}
        />
      </View>

      <ThemedText type="small" style={{ color: theme.textSecondary, paddingHorizontal: Spacing.md, paddingTop: Spacing.xs }}>
        {kind === "except"
          ? "Selected contacts won't see your stories."
          : "Only selected people will see your stories. (Pick from your contacts here; you can extend the list later.)"}
        {selected.size > 0 ? `  ·  ${selected.size} selected` : ""}
      </ThemedText>

      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xl }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.xl }}>
              No contacts found.
            </ThemedText>
          }
          renderItem={({ item }) => {
            const checked = selected.has(item.id);
            return (
              <Pressable
                style={[styles.row, { backgroundColor: theme.backgroundDefault }]}
                onPress={() => toggle(item.id)}
              >
                <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <ThemedText type="body" style={{ color: "#fff" }}>
                      {item.displayName?.charAt(0) || "?"}
                    </ThemedText>
                  )}
                </View>
                <ThemedText type="body" style={{ flex: 1 }}>
                  {item.displayName || "Unknown"}
                </ThemedText>
                <View
                  style={[
                    styles.check,
                    {
                      backgroundColor: checked ? theme.primary : "transparent",
                      borderColor: checked ? theme.primary : theme.border,
                    },
                  ]}
                >
                  {checked ? <Feather name="check" size={14} color="#fff" /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
