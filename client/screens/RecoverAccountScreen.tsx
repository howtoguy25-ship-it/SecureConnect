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
import { getApiUrl, fetchWithTimeout } from "@/lib/api-utils";
import { useAuth, ensureE2EEKeys } from "@/contexts/AuthContext";

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    try { window.alert(`${title}\n\n${message}`); } catch {}
    return;
  }
  Alert.alert(title, message);
}

async function post(path: string, body: unknown) {
  const res = await fetchWithTimeout(new URL(path, getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

type Step = "answers" | "phone" | "code";

export default function RecoverAccountScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { setUser, setToken, setSecurityQuestionsPending } = useAuth();

  const [step, setStep] = useState<Step>("answers");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [accountId, setAccountId] = useState("");
  const [dishAnswer, setDishAnswer] = useState("");
  const [twoWordsAnswer, setTwoWordsAnswer] = useState("");
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  const [newPhone, setNewPhone] = useState("");
  const [code, setCode] = useState("");

  async function handleVerifyAnswers() {
    if (loading || !accountId.trim() || !dishAnswer.trim() || !twoWordsAnswer.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await post("/api/auth/recover/verify", { accountId, dishAnswer, twoWordsAnswer });
      // Wipe plaintext immediately — only the short-lived recovery token
      // (not the answers themselves) carries forward to the next step.
      setDishAnswer("");
      setTwoWordsAnswer("");
      if (data?.valid && data?.recoveryToken) {
        setRecoveryToken(data.recoveryToken);
        setStep("phone");
      } else {
        setError("Those details don't match our records.");
      }
    } catch (err: any) {
      setDishAnswer("");
      setTwoWordsAnswer("");
      setError(err?.message || "Recovery failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode() {
    if (loading || !recoveryToken || !newPhone.trim()) return;
    setLoading(true);
    setError("");
    try {
      await post("/api/auth/recover/send-code", { recoveryToken, phoneNumber: newPhone });
      setStep("code");
    } catch (err: any) {
      setError(err?.message || "Couldn't send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (loading || !recoveryToken || !code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await post("/api/auth/recover/complete", { recoveryToken, phoneNumber: newPhone, code });
      if (data?.success && data?.token && data?.user) {
        setToken(data.token);
        try { await ensureE2EEKeys(data.token); } catch {}
        // They just proved both answers seconds ago as part of recovery —
        // don't immediately re-prompt for the same 2nd factor this session.
        setSecurityQuestionsPending(false);
        setUser(data.user);
      } else {
        setError("Recovery could not be completed. Please try again.");
      }
    } catch (err: any) {
      setError(err?.message || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
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
        <Feather name="key" size={32} color={theme.primary} />
      </View>

      <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
        Recover Your Account
      </ThemedText>

      {step === "answers" && (
        <>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}>
            Enter your Account ID and the answers to your two security questions.
          </ThemedText>

          <View style={styles.field}>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>Account ID</ThemedText>
            <TextInput
              value={accountId}
              onChangeText={(t) => { setAccountId(t); setError(""); }}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>What is your favourite dish?</ThemedText>
            <TextInput
              value={dishAnswer}
              onChangeText={(t) => { setDishAnswer(t); setError(""); }}
              placeholder="Your answer"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>Your 2 memorable words</ThemedText>
            <TextInput
              value={twoWordsAnswer}
              onChangeText={(t) => { setTwoWordsAnswer(t); setError(""); }}
              placeholder="one word, space, one word"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          {error ? <ThemedText type="small" style={{ color: theme.error, marginBottom: Spacing.md, textAlign: "center" }}>{error}</ThemedText> : null}

          <Pressable
            onPress={handleVerifyAnswers}
            disabled={loading || !accountId.trim() || !dishAnswer.trim() || !twoWordsAnswer.trim()}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed || loading ? 0.7 : 1 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Continue</ThemedText>}
          </Pressable>
        </>
      )}

      {step === "phone" && (
        <>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}>
            Verified. Now enter the phone number you'd like to use going forward — we'll text you a code to confirm it's really you.
          </ThemedText>
          <View style={styles.field}>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>New phone number</ThemedText>
            <TextInput
              value={newPhone}
              onChangeText={(t) => { setNewPhone(t); setError(""); }}
              placeholder="+1 555 123 4567"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              keyboardType="phone-pad"
              editable={!loading}
            />
          </View>
          {error ? <ThemedText type="small" style={{ color: theme.error, marginBottom: Spacing.md, textAlign: "center" }}>{error}</ThemedText> : null}
          <Pressable
            onPress={handleSendCode}
            disabled={loading || !newPhone.trim()}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed || loading ? 0.7 : 1 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Send Code</ThemedText>}
          </Pressable>
        </>
      )}

      {step === "code" && (
        <>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}>
            Enter the 6-digit code we texted to {newPhone}.
          </ThemedText>
          <View style={styles.field}>
            <TextInput
              value={code}
              onChangeText={(t) => { setCode(t.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              placeholder="123456"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border, textAlign: "center", letterSpacing: 4, fontSize: 22 }]}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
            />
          </View>
          {error ? <ThemedText type="small" style={{ color: theme.error, marginBottom: Spacing.md, textAlign: "center" }}>{error}</ThemedText> : null}
          <Pressable
            onPress={handleComplete}
            disabled={loading || code.length !== 6}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed || loading ? 0.7 : 1 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Finish Recovery</ThemedText>}
          </Pressable>
        </>
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
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
