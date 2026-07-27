import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { updateProfile } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Feather } from "@expo/vector-icons";

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { setUser } = useAuth();
  
  const [displayName, setDisplayName] = useState("");
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleContinue = async () => {
    if (!displayName.trim()) {
      setError("Please enter your name");
      return;
    }

    setIsLoading(true);
    setError("");

    const user = await updateProfile(displayName.trim(), avatarIndex);

    setIsLoading(false);

    if (user) {
      setUser(user);
    } else {
      setError("Failed to save profile. Please try again.");
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing["4xl"],
          paddingBottom: insets.bottom + Spacing.xl,
        },
      ]}
    >
      <View style={styles.form}>
        <ThemedText type="h2" style={styles.title}>
          Set up your profile
        </ThemedText>
        
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          Choose an avatar and enter your display name
        </ThemedText>

        <View style={styles.avatarContainer}>
          {AVATAR_COLORS.map((color, index) => (
            <Pressable
              key={index}
              onPress={() => setAvatarIndex(index)}
              style={[
                styles.avatarOption,
                {
                  backgroundColor: color,
                  borderColor: index === avatarIndex ? theme.primary : "transparent",
                },
              ]}
            >
              <Feather
                name="user"
                size={28}
                color="#fff"
              />
              {index === avatarIndex ? (
                <View style={[styles.checkmark, { backgroundColor: theme.primary }]}>
                  <Feather name="check" size={12} color="#fff" />
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundDefault,
              color: theme.text,
              borderColor: error ? theme.error : "transparent",
            },
          ]}
          placeholder="Your name"
          placeholderTextColor={theme.textSecondary}
          value={displayName}
          onChangeText={(text) => {
            setDisplayName(text);
            setError("");
          }}
          autoFocus
          editable={!isLoading}
          maxLength={30}
        />

        {error ? (
          <ThemedText type="small" style={[styles.error, { color: theme.error }]}>
            {error}
          </ThemedText>
        ) : null}
      </View>

      <Button
        onPress={handleContinue}
        disabled={!displayName.trim() || isLoading}
        style={styles.button}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : "Continue"}
      </Button>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing["2xl"],
    justifyContent: "space-between",
  },
  form: {
    gap: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  avatarOption: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
  },
  checkmark: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    fontSize: 17,
    borderWidth: 2,
    textAlign: "center",
  },
  error: {
    textAlign: "center",
  },
  button: {
    marginTop: Spacing.xl,
  },
});
