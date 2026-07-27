import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { haptics } from "@/lib/haptics";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Mode = "everyone" | "contacts" | "except" | "only";

const OPTIONS: { mode: Mode; title: string; subtitle: string; icon: string }[] = [
  { mode: "everyone", title: "Everyone", subtitle: "Anyone on Pryvo can view your story.", icon: "globe" },
  { mode: "contacts", title: "My Contacts", subtitle: "Only people in your contacts can view.", icon: "users" },
  { mode: "except", title: "Contacts Except…", subtitle: "Hide from selected contacts.", icon: "user-minus" },
  { mode: "only", title: "Only Share With…", subtitle: "Only selected people can view.", icon: "user-check" },
];

export default function StoryPrivacyScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth() as any;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [mode, setMode] = useState<Mode>((user?.storyPrivacyMode as Mode) ?? "everyone");
  const [exceptCount, setExceptCount] = useState<number>(user?.storyPrivacyExceptIds?.length ?? 0);
  const [onlyCount, setOnlyCount] = useState<number>(user?.storyPrivacyOnlyIds?.length ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode((user?.storyPrivacyMode as Mode) ?? "everyone");
    setExceptCount(user?.storyPrivacyExceptIds?.length ?? 0);
    setOnlyCount(user?.storyPrivacyOnlyIds?.length ?? 0);
  }, [user]);

  const save = async (next: Mode) => {
    const prev = mode;
    setMode(next);
    setSaving(true);
    try {
      const token = await getStoredToken();
      const res = await fetch(new URL("/api/users/me/story-privacy", getApiUrl()), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storyPrivacyMode: next }),
      });
      if (!res.ok) throw new Error("save failed");
      haptics.light();
      if (refreshUser) await refreshUser();
    } catch {
      setMode(prev);
      Alert.alert("Error", "Couldn't save privacy mode.");
    } finally {
      setSaving(false);
    }
  };

  const onPick = (m: Mode) => {
    if (m === "except") {
      navigation.navigate("StoryContactPicker", { kind: "except" });
      if (mode !== "except") save("except");
    } else if (m === "only") {
      navigation.navigate("StoryContactPicker", { kind: "only" });
      if (mode !== "only") save("only");
    } else {
      save(m);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.md,
        gap: Spacing.sm,
      }}
    >
      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>
        Choose who can see your story updates. This setting applies to all future stories.
      </ThemedText>

      {OPTIONS.map((opt) => {
        const selected = mode === opt.mode;
        const trailing =
          opt.mode === "except" && exceptCount > 0 ? `${exceptCount} hidden` :
          opt.mode === "only" && onlyCount > 0 ? `${onlyCount} selected` : "";
        return (
          <Pressable
            key={opt.mode}
            style={[styles.row, { backgroundColor: theme.backgroundDefault, borderColor: selected ? theme.primary : "transparent", borderWidth: selected ? 2 : 0 }]}
            onPress={() => onPick(opt.mode)}
            disabled={saving}
          >
            <View style={[styles.icon, { backgroundColor: theme.primary + "20" }]}>
              <Feather name={opt.icon as any} size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>{opt.title}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                {opt.subtitle}
              </ThemedText>
            </View>
            {trailing ? (
              <ThemedText type="small" style={{ color: theme.textSecondary, marginRight: Spacing.xs }}>{trailing}</ThemedText>
            ) : null}
            {selected ? <Feather name="check" size={20} color={theme.primary} /> : <Feather name="chevron-right" size={18} color={theme.textSecondary} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  icon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
});
