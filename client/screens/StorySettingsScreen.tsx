import React, { useEffect, useState } from "react";
import { View, StyleSheet, Switch, Pressable, Alert, ScrollView, Platform } from "react-native";
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

const MODE_LABEL: Record<string, string> = {
  everyone: "Everyone",
  contacts: "My Contacts",
  except: "Contacts Except…",
  only: "Only Share With…",
};

export default function StorySettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth() as any;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [storiesOn, setStoriesOn] = useState<boolean>(user?.storiesEnabled ?? true);
  const [receipts, setReceipts] = useState<boolean>(user?.storyViewReceiptsEnabled ?? true);
  const [mode, setMode] = useState<string>(user?.storyPrivacyMode ?? "everyone");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStoriesOn(user?.storiesEnabled ?? true);
    setReceipts(user?.storyViewReceiptsEnabled ?? true);
    setMode(user?.storyPrivacyMode ?? "everyone");
  }, [user]);

  const patch = async (body: Record<string, any>, optimistic: () => void, revert: () => void) => {
    optimistic();
    setSaving(true);
    try {
      const token = await getStoredToken();
      const res = await fetch(new URL("/api/users/me/story-privacy", getApiUrl()), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save failed");
      haptics.light();
      if (refreshUser) await refreshUser();
    } catch {
      revert();
      Alert.alert("Error", "Couldn't save your Stories setting.");
    } finally {
      setSaving(false);
    }
  };

  const confirmTurnOff = () => {
    const action = () => patch(
      { storiesEnabled: false },
      () => setStoriesOn(false),
      () => setStoriesOn(true),
    );
    if (Platform.OS === "web") {
      if (window.confirm("Turn off Stories? You won't be able to share or view stories.")) action();
    } else {
      Alert.alert(
        "Turn off Stories?",
        "You won't be able to share or view stories until you turn this back on.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Turn Off", style: "destructive", onPress: action },
        ],
      );
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.md,
        gap: Spacing.lg,
      }}
    >
      {/* Card 1: My Story */}
      <View>
        <Pressable
          style={[styles.card, { backgroundColor: theme.backgroundDefault, opacity: storiesOn ? 1 : 0.5 }]}
          onPress={() => storiesOn && navigation.navigate("StoryPrivacy")}
          disabled={!storiesOn}
        >
          <View style={[styles.icon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="users" size={18} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>My Story</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
              Choose who can view your story
            </ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginRight: Spacing.xs }}>
            {MODE_LABEL[mode] || "Everyone"}
          </ThemedText>
          <Feather name="chevron-right" size={18} color={theme.textSecondary} />
        </Pressable>
        <ThemedText type="small" style={[styles.helper, { color: theme.textSecondary }]}>
          Story updates automatically disappear after 24 hours. Choose who can view your story or create new stories with specific viewers.
        </ThemedText>
      </View>

      {/* Card 2: View Receipts */}
      <View>
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault, opacity: storiesOn ? 1 : 0.5 }]}>
          <View style={[styles.icon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="eye" size={18} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>View Receipts</ThemedText>
          </View>
          <Switch
            value={receipts}
            disabled={saving || !storiesOn}
            onValueChange={(v) =>
              patch({ storyViewReceiptsEnabled: v }, () => setReceipts(v), () => setReceipts(!v))
            }
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>
        <ThemedText type="small" style={[styles.helper, { color: theme.textSecondary }]}>
          See and share when stories are viewed. If disabled, you won't see when others view your stories.
        </ThemedText>
      </View>

      {/* Card 3: Turn Off / Turn On Stories */}
      <View>
        <Pressable
          style={[styles.cardCenter, { backgroundColor: theme.backgroundDefault }]}
          onPress={() =>
            storiesOn
              ? confirmTurnOff()
              : patch({ storiesEnabled: true }, () => setStoriesOn(true), () => setStoriesOn(false))
          }
          disabled={saving}
        >
          <ThemedText type="body" style={{ color: storiesOn ? "#FF3B30" : theme.primary, fontWeight: "600" }}>
            {storiesOn ? "Turn Off Stories" : "Turn On Stories"}
          </ThemedText>
        </Pressable>
        <ThemedText type="small" style={[styles.helper, { color: theme.textSecondary }]}>
          {storiesOn
            ? "If you opt out of stories you will no longer be able to share or view stories."
            : "Turn stories back on to share and view stories again."}
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  cardCenter: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  helper: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
});
