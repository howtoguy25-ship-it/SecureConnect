import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  TextInput,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    try { window.alert(`${title}\n\n${message}`); } catch {}
    return;
  }
  Alert.alert(title, message);
}

export default function SecurityQuestionsVerifyScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { setSecurityQuestionsPending, logout } = useAuth();

  const [dishAnswer, setDishAnswer] = useState("");
  const [twoWordsAnswer, setTwoWordsAnswer] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    if (verifying || !dishAnswer.trim() || !twoWordsAnswer.trim()) return;
    setVerifying(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/auth/security-questions/verify", {
        dishAnswer,
        twoWordsAnswer,
      });
      const data = await res.json();
      // Wipe plaintext from state immediately regardless of outcome.
      setDishAnswer("");
      setTwoWordsAnswer("");
      if (data?.valid) {
        setSecurityQuestionsPending(false);
      } else {
        setError("That doesn't match. Please try again.");
      }
    } catch (err: any) {
      setDishAnswer("");
      setTwoWordsAnswer("");
      setError(err?.message || "Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      <View style={[styles.iconBubble, { backgroundColor: theme.primary + "18" }]}>
        <Feather name="lock" size={32} color={theme.primary} />
      </View>

      <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
        Confirm It's You
      </ThemedText>
      <ThemedText
        type="body"
        style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}
      >
        Answer your two security questions to finish signing in.
      </ThemedText>

      <View style={styles.field}>
        <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>
          What is your favourite dish?
        </ThemedText>
        <TextInput
          value={dishAnswer}
          onChangeText={(t) => { setDishAnswer(t); setError(""); }}
          placeholder="Your answer"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : theme.border }]}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!verifying}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>
          Your 2 memorable words
        </ThemedText>
        <TextInput
          value={twoWordsAnswer}
          onChangeText={(t) => { setTwoWordsAnswer(t); setError(""); }}
          placeholder="one word, space, one word"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : theme.border }]}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!verifying}
        />
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.error, marginBottom: Spacing.md, textAlign: "center" }}>
          {error}
        </ThemedText>
      ) : null}

      <Pressable
        onPress={handleVerify}
        disabled={verifying || !dishAnswer.trim() || !twoWordsAnswer.trim()}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: theme.primary, opacity: pressed || verifying ? 0.7 : 1 },
        ]}
      >
        {verifying ? <ActivityIndicator color="#fff" /> : (
          <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
            Verify
          </ThemedText>
        )}
      </Pressable>

      <Pressable
        onPress={() => Linking.openURL("mailto:adisssal7@hotmail.com?subject=Locked%20out%20-%20forgot%20security%20answers")}
        style={styles.helpLink}
      >
        <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
          Forgot your answers? Contact support
        </ThemedText>
      </Pressable>

      <Pressable onPress={() => logout()} style={styles.helpLink}>
        <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
          Log out
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  input: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  helpLink: {
    marginTop: Spacing.lg,
    paddingVertical: 8,
  },
});
