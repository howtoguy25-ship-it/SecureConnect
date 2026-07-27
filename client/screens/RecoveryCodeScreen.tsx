import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { generateRecoveryCode, encryptBackup } from "@/utils/crypto/backupCrypto";
import * as Clipboard from "expo-clipboard";
import { getDeviceId } from "@/utils/crypto/prekeyManager";

// Cross-platform alert. On web, Alert.alert maps to a blocking window.alert
// (or silently no-ops if the browser has throttled dialogs), so we route to
// window.alert directly to keep the flow predictable.
function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }
  Alert.alert(title, message);
}

export default function RecoveryCodeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [step, setStep] = useState<"intro" | "generating" | "show" | "done">("intro");
  const [recoveryCode, setRecoveryCode] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setStep("generating");
    try {
      const code = await generateRecoveryCode();
      setRecoveryCode(code);
      setStep("show");
    } catch {
      showAlert("Error", "Could not generate recovery code. Please try again.");
      setStep("intro");
    }
  }

  async function handleCopy() {
    try {
      await Clipboard.setStringAsync(recoveryCode);
    } catch {
      // Fallback for browsers without async clipboard permission
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        try { await navigator.clipboard.writeText(recoveryCode); } catch {}
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleShare() {
    const message = `Pryvo Recovery Code:\n\n${recoveryCode}\n\nStore this safely. It can restore your encryption keys.`;
    // Web Share API is only available on some mobile browsers and requires HTTPS
    // plus a user gesture. On unsupported browsers (desktop Chrome/Firefox, etc.)
    // RN-Web's Share.share throws or no-ops. Fall back to copying.
    if (Platform.OS === "web") {
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      if (nav && typeof nav.share === "function") {
        try {
          await nav.share({ title: "Pryvo Recovery Code", text: message });
          return;
        } catch {
          // User cancelled or share unsupported — fall through to copy fallback
        }
      }
      try {
        await Clipboard.setStringAsync(recoveryCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        showAlert("Copied", "Recovery code copied to clipboard. Paste it somewhere safe.");
      } catch {
        showAlert("Share unavailable", "Your browser doesn't support sharing. Use Copy instead.");
      }
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      showAlert("Error", "Could not open the share sheet.");
    }
  }

  async function handleSaveBackup() {
    if (!confirmed) {
      showAlert("Confirm", "Please tick the checkbox to confirm you have saved your recovery code before continuing.");
      return;
    }
    setSaving(true);
    try {
      const blob = await encryptBackup(recoveryCode);
      if (!blob) {
        showAlert("Error", "No encryption keys found to back up.");
        setSaving(false);
        return;
      }

      let deviceId = "default";
      try { deviceId = await getDeviceId(); } catch {}

      const token = await getStoredToken();
      const url = new URL("/api/e2ee/backup", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ deviceId, ...blob }),
      });
      if (!res.ok) throw new Error("Server error");
      setStep("done");
    } catch {
      showAlert("Error", "Failed to save backup. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const codeSegments = recoveryCode ? recoveryCode.split("-") : [];

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      {step === "intro" && (
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: theme.primary + "18" }]}>
            <Feather name="key" size={36} color={theme.primary} />
          </View>
          <ThemedText type="h3" style={styles.title}>Recovery Code</ThemedText>
          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            A recovery code lets you restore your encryption keys on a new device.
          </ThemedText>
          <ThemedText type="small" style={[styles.warning, { color: theme.error, backgroundColor: theme.error + "14", borderColor: theme.error + "30" }]}>
            Keep your recovery code somewhere safe. If you lose it, you cannot recover your old messages on a new device.
          </ThemedText>
          <Pressable
            onPress={handleGenerate}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            <Feather name="plus-circle" size={18} color="#fff" />
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700", marginLeft: 8 }}>
              Generate Recovery Code
            </ThemedText>
          </Pressable>
        </View>
      )}

      {step === "generating" && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: 16 }}>
            Generating your recovery code...
          </ThemedText>
        </View>
      )}

      {step === "show" && (
        <View>
          <View style={[styles.iconCircle, { backgroundColor: theme.primary + "18", alignSelf: "center" }]}>
            <Feather name="lock" size={36} color={theme.primary} />
          </View>
          <ThemedText type="h3" style={[styles.title, { textAlign: "center" }]}>
            Your Recovery Code
          </ThemedText>
          <ThemedText type="small" style={[styles.subtitle, { color: theme.textSecondary, textAlign: "center" }]}>
            Write it down or store it in a password manager.
          </ThemedText>

          <View style={[styles.codeCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <View style={styles.codeGrid}>
              {codeSegments.map((seg, i) => (
                <View key={i} style={[styles.codeSegment, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                  <ThemedText style={[styles.codeText, { color: theme.text }]}>{seg}</ThemedText>
                </View>
              ))}
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginTop: 8 }}>
              {recoveryCode}
            </ThemedText>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={handleCopy}
              style={[styles.secondaryBtn, { borderColor: theme.primary, flex: 1, marginRight: 8 }]}
            >
              <Feather name={copied ? "check" : "copy"} size={16} color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.primary, marginLeft: 6, fontWeight: "600" }}>
                {copied ? "Copied" : "Copy"}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={handleShare}
              style={[styles.secondaryBtn, { borderColor: theme.primary, flex: 1, marginLeft: 8 }]}
            >
              <Feather name="share-2" size={16} color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.primary, marginLeft: 6, fontWeight: "600" }}>
                Share
              </ThemedText>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setConfirmed(!confirmed)}
            style={styles.checkRow}
          >
            <View style={[
              styles.checkbox,
              {
                borderColor: confirmed ? theme.primary : theme.border,
                backgroundColor: confirmed ? theme.primary : "transparent",
              },
            ]}>
              {confirmed ? <Feather name="check" size={12} color="#fff" /> : null}
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, marginLeft: 10 }}>
              I have saved my recovery code in a safe place
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleSaveBackup}
            disabled={saving || !confirmed}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: confirmed ? theme.primary : theme.border,
                opacity: saving ? 0.7 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="upload-cloud" size={18} color="#fff" />
                <ThemedText type="body" style={{ color: "#fff", fontWeight: "700", marginLeft: 8 }}>
                  Save Encrypted Backup
                </ThemedText>
              </>
            )}
          </Pressable>
        </View>
      )}

      {step === "done" && (
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: "#22c55e18" }]}>
            <Feather name="check-circle" size={48} color="#22c55e" />
          </View>
          <ThemedText type="h3" style={styles.title}>Backup Saved</ThemedText>
          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            Your encrypted key backup has been securely saved. Your recovery code is the only way to restore it.
          </ThemedText>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Done</ThemedText>
          </Pressable>
        </View>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    paddingTop: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  warning: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    lineHeight: 18,
    textAlign: "center",
    width: "100%",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: 8,
    width: "100%",
    minHeight: 50,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    minHeight: 42,
  },
  codeCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  codeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  codeSegment: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  codeText: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "monospace",
    letterSpacing: 3,
  },
  actionRow: {
    flexDirection: "row",
    marginBottom: Spacing.lg,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
