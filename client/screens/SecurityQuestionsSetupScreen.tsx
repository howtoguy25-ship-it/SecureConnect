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

export default function SecurityQuestionsSetupScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user, setUser, refreshUser } = useAuth();

  const [dishAnswer, setDishAnswer] = useState("");
  const [twoWordsAnswer, setTwoWordsAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const twoWordCount = twoWordsAnswer.trim().split(/\s+/).filter(Boolean).length;
  const canSet = dishAnswer.trim().length > 0 && twoWordCount === 2 && !saving;

  async function handleSet() {
    if (!canSet) {
      if (twoWordCount !== 2) {
        showAlert("Two words needed", "Enter exactly two words for the second question, separated by a space — for example: sunset guitar");
      }
      return;
    }
    // A blocking confirm, not just the banner above — these answers are
    // encrypted the instant Set succeeds and Pryvo can never read or
    // recover them afterward, so this is the last moment to back out and
    // write them down first.
    const confirmed = await new Promise<boolean>((resolve) => {
      if (Platform.OS === "web") {
        resolve(window.confirm("Have you saved these answers somewhere safe (written down or in a password manager)?\n\nOnce you tap Set, they're encrypted and Pryvo can never read or recover them for you."));
        return;
      }
      Alert.alert(
        "Have you saved these answers?",
        "Once you tap Set, they're encrypted and Pryvo can never read or recover them for you. Make sure you've written them down or stored them in a password manager first.",
        [
          { text: "Go back", style: "cancel", onPress: () => resolve(false) },
          { text: "Yes, I've saved them", onPress: () => resolve(true) },
        ],
      );
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      await apiRequest("POST", "/api/auth/security-questions/set", {
        dishAnswer,
        twoWordsAnswer,
      });
      // Encrypted (hashed) server-side the instant the request above
      // resolves — wipe the plaintext from this screen's state right away
      // so it never lingers in memory or gets shown again.
      setDishAnswer("");
      setTwoWordsAnswer("");
      setSaved(true);
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to save your security questions. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleContinue() {
    if (continuing) return;
    setContinuing(true);
    try {
      // The /set POST in handleSet() already succeeded (that's the only way
      // `saved` became true) — flip the gate locally right away rather than
      // depending solely on a follow-up /me fetch, which would silently
      // fall back to the stale cached user (still hasSecurityQuestions:
      // false) on any transient network hiccup and strand this screen.
      if (user) setUser({ ...user, hasSecurityQuestions: true });
      refreshUser().catch(() => {});
    } finally {
      setContinuing(false);
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
        <Feather name="help-circle" size={32} color={theme.primary} />
      </View>

      <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
        Set Your Security Questions
      </ThemedText>
      <ThemedText
        type="body"
        style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}
      >
        These, plus your Account ID, are how you recover your account if you ever lose access. Your answers are encrypted the moment you hit Set — nobody, including Pryvo, can ever read them back.
      </ThemedText>

      {saved ? (
        <View style={[styles.warningCard, { backgroundColor: theme.primary + "10", borderColor: theme.primary + "40" }]}>
          <Feather name="check-circle" size={20} color={theme.primary} style={{ marginBottom: 8 }} />
          <ThemedText type="body" style={{ fontWeight: "700", marginBottom: 4 }}>
            Security questions saved
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 18 }}>
            Your answers have already been encrypted and cleared from this screen. Remember them — you'll be asked to re-enter them every time you log back in.
          </ThemedText>
        </View>
      ) : (
        <>
          <View style={[styles.warningBanner, { backgroundColor: theme.warning + "18", borderColor: theme.warning + "60" }]}>
            <Feather name="alert-triangle" size={20} color={theme.warning} style={{ marginBottom: 8 }} />
            <ThemedText type="body" style={{ fontWeight: "700", color: theme.warning, marginBottom: 4 }}>
              Save these answers somewhere safe
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 18 }}>
              Write them down, or store them in a password manager, before you continue. Pryvo encrypts your answers immediately and can never read or recover them for you — if you forget them, you could permanently lose access to your account.
            </ThemedText>
          </View>

          <View style={styles.field}>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>
              What is your favourite dish?
            </ThemedText>
            <TextInput
              value={dishAnswer}
              onChangeText={setDishAnswer}
              placeholder="e.g. Lasagna"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>
              2 words you will remember if you ever forget your login details
            </ThemedText>
            <TextInput
              value={twoWordsAnswer}
              onChangeText={setTwoWordsAnswer}
              placeholder="one word, space, one word"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 6 }}>
              Enter one word, then a space, then a second word — e.g. "sunset guitar"
            </ThemedText>
          </View>

          <Pressable
            onPress={handleSet}
            disabled={!canSet}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.primary, opacity: pressed || !canSet ? 0.6 : 1 },
            ]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
                Set
              </ThemedText>
            )}
          </Pressable>
        </>
      )}

      {saved && (
        <Pressable
          onPress={handleContinue}
          disabled={continuing}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: theme.primary, opacity: pressed || continuing ? 0.7 : 1, marginTop: Spacing.lg },
          ]}
        >
          {continuing ? <ActivityIndicator color="#fff" /> : (
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
              Continue
            </ThemedText>
          )}
        </Pressable>
      )}
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
  warningCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  warningBanner: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
