import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Platform, Alert } from "react-native";
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

function Field({
  icon,
  label,
  helper,
  placeholder,
  value,
  onChangeText,
  theme,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  helper: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  theme: any;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Feather name={icon} size={16} color={theme.primary} />
        <ThemedText type="body" style={{ fontWeight: "600", marginLeft: Spacing.xs }}>{label}</ThemedText>
      </View>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
        {helper}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
      />
    </View>
  );
}

export default function PaymentMethodsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user, refreshUser } = useAuth();

  const [paypalMeHandle, setPaypalMeHandle] = useState(user?.paymentPaypalMeHandle ?? "");
  const [payId, setPayId] = useState(user?.paymentPayId ?? "");
  const [btcAddress, setBtcAddress] = useState(user?.paymentBtcAddress ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/users/me/payment-methods", {
        paypalMeHandle: paypalMeHandle.trim(),
        payId: payId.trim(),
        btcAddress: btcAddress.trim(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save your payment methods.");
      await refreshUser();
      showAlert("Saved", "Your payment methods have been updated.");
    } catch (error: any) {
      showAlert("Error", error?.message || "Couldn't save your payment methods.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      <View style={[styles.infoCard, { backgroundColor: theme.primary + "10", borderColor: theme.primary + "30" }]}>
        <Feather name="shield" size={18} color={theme.primary} style={{ marginBottom: 6 }} />
        <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 18 }}>
          Pryvo never touches your money or holds funds. These are receive-only details you choose to share with people you chat with — sending always happens in that provider's own app or bank, never inside Pryvo.
        </ThemedText>
      </View>

      <Field
        icon="dollar-sign"
        label="PayPal.me"
        helper="Your PayPal.me username, e.g. paypal.me/yourhandle"
        placeholder="yourhandle"
        value={paypalMeHandle}
        onChangeText={setPaypalMeHandle}
        theme={theme}
      />
      <Field
        icon="credit-card"
        label="PayID (Australia)"
        helper="An email, phone number, or ABN registered as your PayID for OSKO/NPP transfers"
        placeholder="you@example.com"
        value={payId}
        onChangeText={setPayId}
        theme={theme}
      />
      <Field
        icon="hash"
        label="Bitcoin Address"
        helper="A receive-only BTC address — never share a private key or seed phrase"
        placeholder="bc1q..."
        value={btcAddress}
        onChangeText={setBtcAddress}
        theme={theme}
      />

      <Pressable
        onPress={handleSave}
        disabled={isSaving}
        style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed || isSaving ? 0.7 : 1 }]}
      >
        {isSaving ? <ActivityIndicator color="#fff" /> : <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Save</ThemedText>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
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
    marginTop: Spacing.md,
  },
});
