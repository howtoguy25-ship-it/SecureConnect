import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import { encryptExportPayload } from "@/utils/exportCrypto";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

type Step = "intro" | "passphrase" | "generating" | "done" | "error";

const MIN_PASSPHRASE_LENGTH = 8;

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    try { window.alert(`${title}\n\n${message}`); } catch {}
    return;
  }
  Alert.alert(title, message);
}

export default function ExportDataScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [step, setStep] = useState<Step>("intro");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const passphraseValid = passphrase.length >= MIN_PASSPHRASE_LENGTH && passphrase === confirmPassphrase;

  const handleGenerate = async () => {
    if (!passphraseValid) return;
    setStep("generating");
    try {
      const res = await apiRequest("GET", "/api/account/export-data");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't fetch your account data.");
      }
      const payload = await res.json();
      const encrypted = await encryptExportPayload(payload, passphrase);
      const fileContents = JSON.stringify(encrypted, null, 2);
      const fileName = `pryvo-account-export-${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === "web") {
        try {
          const blob = new Blob([fileContents], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {
          throw new Error("Couldn't save the file on web. Please try again.");
        }
      } else {
        // documentDirectory, not cacheDirectory — the same directory that
        // turned out to be getting purged by iOS fast enough to break voice
        // playback (see encryptedMediaClient.ts). Sharing.shareAsync right
        // below reads this file a moment later; no reason to risk the same
        // failure class here too.
        const path = `${FileSystem.documentDirectory}${fileName}`;
        // UTF8 is writeAsStringAsync's default encoding when omitted — no
        // need to reference FileSystem.EncodingType (whose declarations
        // don't resolve under the /legacy import path; see the pre-existing
        // "expo-file-system/legacy" tsc gap noted elsewhere in this codebase,
        // e.g. ProfileScreen.tsx and ConversationScreen.tsx).
        await FileSystem.writeAsStringAsync(path, fileContents);
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(path, {
            mimeType: "application/json",
            dialogTitle: "Save your encrypted Pryvo data export",
          });
        }
      }

      setStep("done");
    } catch (error: any) {
      setErrorMessage(error?.message || "Something went wrong generating your export.");
      setStep("error");
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
      <View style={[styles.iconBubble, { backgroundColor: theme.primary + "18" }]}>
        <Feather name="download" size={32} color={theme.primary} />
      </View>

      {step === "intro" ? (
        <>
          <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
            Download Your Data
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}>
            Get a copy of everything Pryvo stores about your account — your profile, settings, security status, and chat list. This won't include message content, since your messages are end-to-end encrypted and we can't read them either.
          </ThemedText>

          <View style={[styles.infoCard, { backgroundColor: theme.primary + "10", borderColor: theme.primary + "30" }]}>
            <Feather name="lock" size={18} color={theme.primary} style={{ marginBottom: 6 }} />
            <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 18 }}>
              The file is encrypted with a passphrase only you choose. It's never sent to our servers or stored anywhere — if you lose it, the file can't be recovered by anyone, including us.
            </ThemedText>
          </View>

          <Pressable
            onPress={() => setStep("passphrase")}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Create Encrypted Export</ThemedText>
          </Pressable>
        </>
      ) : step === "passphrase" ? (
        <>
          <ThemedText type="h2" style={{ textAlign: "center", marginBottom: 8 }}>
            Choose a Passphrase
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 }}>
            At least {MIN_PASSPHRASE_LENGTH} characters. Write it down somewhere safe — we can't reset it for you.
          </ThemedText>

          <View style={styles.field}>
            <TextInput
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder="Passphrase"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              autoFocus
            />
          </View>
          <View style={styles.field}>
            <TextInput
              value={confirmPassphrase}
              onChangeText={setConfirmPassphrase}
              placeholder="Confirm passphrase"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
            />
          </View>

          {passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE_LENGTH ? (
            <ThemedText type="small" style={{ color: theme.error, marginBottom: Spacing.md, textAlign: "center" }}>
              Must be at least {MIN_PASSPHRASE_LENGTH} characters
            </ThemedText>
          ) : confirmPassphrase.length > 0 && passphrase !== confirmPassphrase ? (
            <ThemedText type="small" style={{ color: theme.error, marginBottom: Spacing.md, textAlign: "center" }}>
              Passphrases don't match
            </ThemedText>
          ) : null}

          <Pressable
            onPress={handleGenerate}
            disabled={!passphraseValid}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: passphraseValid ? theme.primary : theme.border, opacity: pressed ? 0.8 : 1 }]}
          >
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Generate Export</ThemedText>
          </Pressable>
        </>
      ) : step === "generating" ? (
        <View style={{ alignItems: "center", paddingTop: Spacing.xl }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.lg }}>
            Encrypting your data…
          </ThemedText>
        </View>
      ) : step === "done" ? (
        <View style={{ alignItems: "center", paddingTop: Spacing.md }}>
          <Feather name="check-circle" size={48} color={theme.success} />
          <ThemedText type="h3" style={{ marginTop: Spacing.md, marginBottom: 8, textAlign: "center" }}>
            Export Ready
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: Spacing.xl }}>
            {Platform.OS === "web"
              ? "Your encrypted export has been downloaded."
              : "Save your encrypted export somewhere safe. Remember your passphrase — it's the only way to open it."}
          </ThemedText>
          <Pressable
            onPress={() => { setStep("intro"); setPassphrase(""); setConfirmPassphrase(""); }}
            style={[styles.primaryBtn, { backgroundColor: theme.primary, alignSelf: "stretch" }]}
          >
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Done</ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={{ alignItems: "center", paddingTop: Spacing.md }}>
          <Feather name="alert-triangle" size={48} color={theme.error} />
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.md, marginBottom: Spacing.xl }}>
            {errorMessage}
          </ThemedText>
          <Pressable
            onPress={() => setStep("passphrase")}
            style={[styles.primaryBtn, { backgroundColor: theme.primary, alignSelf: "stretch" }]}
          >
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Try Again</ThemedText>
          </Pressable>
        </View>
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
  infoCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  field: {
    marginBottom: Spacing.md,
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
    marginTop: Spacing.sm,
  },
});
