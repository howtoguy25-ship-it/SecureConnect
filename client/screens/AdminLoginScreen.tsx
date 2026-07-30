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
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getApiUrl, fetchWithTimeout } from "@/lib/api-utils";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "AdminLogin">;

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

type Step = "phone" | "code";

// This is a deliberately separate sign-in from the normal phone/OTP flow —
// it never touches the main AuthContext session. It proves phone
// possession the same way normal login does, but the server gates it to
// the configured owner number before it will even send a code (see
// /api/auth/admin-login/send-code), and the token it returns is short-lived
// and scoped to this dashboard visit only.
export default function AdminLoginScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();

  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");

  async function handleSendCode() {
    if (loading || !phoneNumber.trim()) return;
    setLoading(true);
    setError("");
    try {
      await post("/api/auth/admin-login/send-code", { phoneNumber });
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
      const data = await post("/api/auth/admin-login/verify", { phoneNumber, code });
      if (data?.success && data?.token) {
        setCode("");
        navigation.replace("AdminDashboard", { token: data.token });
      } else {
        setError("Verification failed. Please try again.");
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
        <Feather name="shield" size={32} color={theme.primary} />
      </View>

      <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
        Admin Sign In
      </ThemedText>
      <ThemedText
        type="body"
        style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}
      >
        Owner-only access. Enter the owner's phone number to receive a verification code.
      </ThemedText>

      {step === "phone" ? (
        <>
          <View style={styles.field}>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: 8 }}>Phone number</ThemedText>
            <TextInput
              value={phoneNumber}
              onChangeText={(t) => { setPhoneNumber(t); setError(""); }}
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
            disabled={loading || !phoneNumber.trim()}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed || loading ? 0.7 : 1 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Send Code</ThemedText>}
          </Pressable>
        </>
      ) : (
        <>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}>
            Enter the 6-digit code we texted to {phoneNumber}.
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
