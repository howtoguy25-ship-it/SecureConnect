import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";

type PrivacyOption = "everyone" | "contacts" | "vip" | "nobody";

const OPTIONS: { value: PrivacyOption; label: string; description: string }[] = [
  { value: "everyone", label: "Everyone", description: "Anyone can see when you were last online" },
  { value: "contacts", label: "Contacts Only", description: "Only your contacts can see your status" },
  { value: "vip", label: "VIP Members Only", description: "Only VIP members can see your status" },
  { value: "nobody", label: "Nobody", description: "No one can see when you were last online" },
];

export default function LastSeenPrivacyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth();
  const [selected, setSelected] = useState<PrivacyOption>(
    (user?.lastSeenPrivacy as PrivacyOption) || "everyone"
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user?.lastSeenPrivacy) {
      setSelected(user.lastSeenPrivacy as PrivacyOption);
    }
  }, [user?.lastSeenPrivacy]);

  const handleSelect = async (option: PrivacyOption) => {
    const previous = selected;
    setSelected(option);
    setIsLoading(true);
    try {
      const token = await getStoredToken();
      const response = await fetch(new URL('/api/privacy/last-seen', getApiUrl()).toString(), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ setting: option }),
      });
      if (!response.ok) {
        throw new Error(`Save failed (${response.status})`);
      }
      // Pull the fresh user object so the saved value survives leaving and
      // re-entering this screen (it reads the initial value from the user).
      await refreshUser();
    } catch (error) {
      console.error("Error updating privacy:", error);
      setSelected(previous);
      if (Platform.OS === "web") {
        console.error("Could not save your privacy setting. Please try again.");
      } else {
        Alert.alert("Not saved", "Could not save your privacy setting. Please check your connection and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Last Seen Privacy",
    });
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot, paddingTop: insets.top + 60 }]}>
      <ThemedText type="small" style={[styles.description, { color: theme.textSecondary }]}>
        Choose who can see when you were last online
      </ThemedText>

      <View style={[styles.optionsContainer, { backgroundColor: theme.backgroundDefault }]}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.option, { borderBottomColor: theme.border }]}
            onPress={() => handleSelect(option.value)}
            disabled={isLoading}
          >
            <View style={styles.optionContent}>
              <ThemedText type="body">{option.label}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {option.description}
              </ThemedText>
            </View>
            {selected === option.value && (
              <Feather name="check" size={20} color={theme.primary} />
            )}
          </Pressable>
        ))}
      </View>

      {isLoading && (
        <ActivityIndicator size="small" color={theme.primary} style={styles.loader} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  description: {
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  optionsContainer: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  loader: {
    marginTop: Spacing.lg,
  },
});
