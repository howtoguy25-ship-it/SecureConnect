import React, { useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, ScrollView, Alert, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    try { window.alert(`${title}\n\n${message}`); } catch {}
    return;
  }
  Alert.alert(title, message);
}

type Step = "phone" | "code";

export default function ChangePhoneNumberScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const { user, refreshUser } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [code, setCode] = useState("");

  const normalizedNew = `+${newPhoneNumber.replace(/\D/g, "")}`;

  async function handleSendCode() {
    if (loading || !newPhoneNumber.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/auth/change-phone/send-code", { newPhoneNumber: normalizedNew });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't send verification code.");
      setStep("code");
    } catch (err: any) {
      setError(err?.message || "Couldn't send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (loading || code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/auth/change-phone/verify", { newPhoneNumber: normalizedNew, code });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Invalid code. Please try again.");
      await refreshUser();
      showAlert("Phone Number Updated", `Your account is now linked to ${normalizedNew}.`);
      navigation.goBack();
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
        <Feather name="phone" size={32} color={theme.primary} />
      </View>

      {step === "phone" ? (
        <>
          <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
            Change Phone Number
          </ThemedText>
          <ThemedText
            type="body"
            style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}
          >
            Your account is currently linked to {user?.phoneNumber}. Enter a new number to receive a verification code.
          </ThemedText>

          <View style={styles.field}>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>New phone number</ThemedText>
            <TextInput
              value={newPhoneNumber}
              onChangeText={(t) => { setNewPhoneNumber(t); setError(""); }}
              placeholder="+1 555 123 4567"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              keyboardType="phone-pad"
              editable={!loading}
              autoFocus
            />
          </View>

          {error ? <ThemedText type="small" style={{ color: theme.error, marginBottom: Spacing.md, textAlign: "center" }}>{error}</ThemedText> : null}

          <Pressable
            onPress={handleSendCode}
            disabled={loading || !newPhoneNumber.trim()}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed || loading ? 0.7 : 1 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Send Code</ThemedText>}
          </Pressable>
        </>
      ) : (
        <>
          <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
            Verify New Number
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}>
            Enter the 6-digit code we texted to {normalizedNew}.
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
              autoFocus
            />
          </View>
          {error ? <ThemedText type="small" style={{ color: theme.error, marginBottom: Spacing.md, textAlign: "center" }}>{error}</ThemedText> : null}
          <Pressable
            onPress={handleVerify}
            disabled={loading || code.length !== 6}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed || loading ? 0.7 : 1 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Verify</ThemedText>}
          </Pressable>
          <Pressable
            onPress={() => { setStep("phone"); setCode(""); setError(""); }}
            disabled={loading}
            style={{ marginTop: Spacing.lg, alignItems: "center" }}
          >
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Use a different number
            </ThemedText>
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
