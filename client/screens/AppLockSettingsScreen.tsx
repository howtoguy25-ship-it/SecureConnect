import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { PinPad } from "@/components/PinPad";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import {
  getAppLockSettings,
  setAppLockPin,
  setAppLockTimeout,
  verifyAppLockPin,
  clearAppLockPin,
  type AppLockMode,
} from "@/utils/appLock";

type Step = "status" | "verifyCurrent" | "chooseMode" | "enterPin" | "confirmPin";
type Intent = "setup" | "change" | "disable";

const TIMEOUT_OPTIONS: { label: string; seconds: number }[] = [
  { label: "Immediately", seconds: 0 },
  { label: "After 1 minute", seconds: 60 },
  { label: "After 5 minutes", seconds: 300 },
  { label: "After 30 minutes", seconds: 1800 },
];

const MIN_PIN_LENGTH = 4;

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function AppLockSettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const [isEnabled, setIsEnabled] = useState(false);
  const [currentMode, setCurrentMode] = useState<AppLockMode | null>(null);
  const [timeoutSeconds, setTimeoutSecondsState] = useState(0);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>("status");
  const [intent, setIntent] = useState<Intent>("setup");
  const [pendingMode, setPendingMode] = useState<AppLockMode>("numeric");
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const settings = await getAppLockSettings();
    setIsEnabled(!!settings);
    setCurrentMode(settings?.mode ?? null);
    setTimeoutSecondsState(settings?.timeoutSeconds ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const resetFlow = () => {
    setStep("status");
    setCurrentPinInput("");
    setFirstPin("");
    setPinInput("");
    setError(null);
  };

  const startSetup = () => {
    setIntent("setup");
    setPendingMode("numeric");
    setStep("chooseMode");
  };

  const startChange = () => {
    setIntent("change");
    setCurrentPinInput("");
    setError(null);
    setStep("verifyCurrent");
  };

  const startDisable = () => {
    setIntent("disable");
    setCurrentPinInput("");
    setError(null);
    setStep("verifyCurrent");
  };

  const handleVerifyCurrent = async (pin: string) => {
    const ok = await verifyAppLockPin(pin);
    if (!ok) {
      setError("Incorrect PIN");
      setCurrentPinInput("");
      return;
    }
    if (intent === "disable") {
      await clearAppLockPin();
      await refresh();
      resetFlow();
      showAlert("App Lock Off", "App Lock has been turned off on this device.");
      return;
    }
    setPendingMode("numeric");
    setStep("chooseMode");
  };

  const handleFirstPinDone = (pin: string) => {
    if (pin.length < MIN_PIN_LENGTH) {
      setError(`Must be at least ${MIN_PIN_LENGTH} characters`);
      return;
    }
    setFirstPin(pin);
    setPinInput("");
    setError(null);
    setStep("confirmPin");
  };

  const handleConfirmPin = async (pin: string) => {
    if (pin !== firstPin) {
      setError("Codes don't match. Try again.");
      setFirstPin("");
      setPinInput("");
      setStep("enterPin");
      return;
    }
    await setAppLockPin(firstPin, pendingMode, timeoutSeconds);
    await refresh();
    resetFlow();
    showAlert("App Lock On", "Your app-unlock PIN has been set.");
  };

  const handleChangeTimeout = async (seconds: number) => {
    setTimeoutSecondsState(seconds);
    await setAppLockTimeout(seconds);
  };

  if (loading) {
    return <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        alignItems: step === "status" ? "stretch" : "center",
      }}
    >
      {step === "status" ? (
        <>
          <View style={[styles.statusCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={[styles.iconBg, { backgroundColor: isEnabled ? theme.primary : theme.textSecondary }]}>
              <Feather name={isEnabled ? "lock" : "unlock"} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="body" style={{ fontWeight: "700" }}>
                App Lock is {isEnabled ? "On" : "Off"}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                {isEnabled
                  ? `Requires your ${currentMode === "numeric" ? "numeric PIN" : "alphanumeric passcode"} to open Pryvo`
                  : "Require a PIN to open Pryvo on this device"}
              </ThemedText>
            </View>
          </View>

          {isEnabled ? (
            <>
              <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                LOCK AFTER
              </ThemedText>
              {TIMEOUT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.seconds}
                  style={[styles.optionRow, { backgroundColor: theme.backgroundDefault }]}
                  onPress={() => handleChangeTimeout(opt.seconds)}
                >
                  <ThemedText type="body">{opt.label}</ThemedText>
                  {timeoutSeconds === opt.seconds ? (
                    <Feather name="check" size={18} color={theme.primary} />
                  ) : null}
                </Pressable>
              ))}

              <Pressable style={[styles.actionRow, { backgroundColor: theme.backgroundDefault }]} onPress={startChange}>
                <ThemedText type="body">Change PIN</ThemedText>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
              <Pressable style={[styles.actionRow, { backgroundColor: theme.backgroundDefault }]} onPress={startDisable}>
                <ThemedText type="body" style={{ color: theme.error }}>Turn Off App Lock</ThemedText>
              </Pressable>
            </>
          ) : (
            <Pressable style={[styles.ctaButton, { backgroundColor: theme.primary }]} onPress={startSetup}>
              <Feather name="lock" size={16} color="#fff" />
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700", marginLeft: Spacing.sm }}>
                Turn On App Lock
              </ThemedText>
            </Pressable>
          )}

          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.lg, textAlign: "center" }}>
            This PIN stays on your device only — it's separate from your Account ID and security questions, and doesn't protect your messages if the app is reinstalled.
          </ThemedText>
        </>
      ) : step === "verifyCurrent" ? (
        <View style={styles.centerStep}>
          <ThemedText type="h2" style={{ fontWeight: "700", marginBottom: Spacing.xs }}>
            Enter Current PIN
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xl, textAlign: "center" }}>
            {intent === "disable" ? "Confirm your PIN to turn off App Lock" : "Confirm your PIN to change it"}
          </ThemedText>
          {currentMode === "numeric" ? (
            <PinPad
              value={currentPinInput}
              onChange={(v) => {
                setError(null);
                setCurrentPinInput(v);
              }}
              maxLength={12}
              theme={theme}
            />
          ) : (
            <SimpleTextEntry value={currentPinInput} onChange={setCurrentPinInput} theme={theme} />
          )}
          {error ? <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.md }}>{error}</ThemedText> : null}
          <View style={styles.stepButtonRow}>
            <Pressable style={styles.cancelButton} onPress={resetFlow}>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, { backgroundColor: currentPinInput.length >= MIN_PIN_LENGTH ? theme.primary : theme.border }]}
              disabled={currentPinInput.length < MIN_PIN_LENGTH}
              onPress={() => handleVerifyCurrent(currentPinInput)}
            >
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Continue</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : step === "chooseMode" ? (
        <View style={styles.centerStep}>
          <ThemedText type="h2" style={{ fontWeight: "700", marginBottom: Spacing.lg }}>
            Choose PIN Type
          </ThemedText>
          <View style={[styles.segmented, { borderColor: theme.border }]}>
            {(["numeric", "alphanumeric"] as AppLockMode[]).map((m) => (
              <Pressable
                key={m}
                style={[styles.segment, pendingMode === m && { backgroundColor: theme.primary }]}
                onPress={() => setPendingMode(m)}
              >
                <ThemedText style={{ color: pendingMode === m ? "#fff" : theme.text, fontWeight: "600" }}>
                  {m === "numeric" ? "Numeric" : "Alphanumeric"}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
            {pendingMode === "numeric"
              ? "A PIN made only of numbers (4-8 digits)"
              : "A passcode using letters, numbers, and symbols"}
          </ThemedText>
          <View style={styles.stepButtonRow}>
            <Pressable style={styles.cancelButton} onPress={resetFlow}>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, { backgroundColor: theme.primary }]}
              onPress={() => { setPinInput(""); setError(null); setStep("enterPin"); }}
            >
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Continue</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : step === "enterPin" ? (
        <View style={styles.centerStep}>
          <ThemedText type="h2" style={{ fontWeight: "700", marginBottom: Spacing.xs }}>
            Create Your {pendingMode === "numeric" ? "PIN" : "Passcode"}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xl, textAlign: "center" }}>
            At least {MIN_PIN_LENGTH} characters
          </ThemedText>
          {pendingMode === "numeric" ? (
            <PinPad value={pinInput} onChange={(v) => { setError(null); setPinInput(v); }} maxLength={8} theme={theme} />
          ) : (
            <SimpleTextEntry value={pinInput} onChange={setPinInput} theme={theme} />
          )}
          {error ? <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.md }}>{error}</ThemedText> : null}
          <View style={styles.stepButtonRow}>
            <Pressable style={styles.cancelButton} onPress={resetFlow}>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, { backgroundColor: pinInput.length >= MIN_PIN_LENGTH ? theme.primary : theme.border }]}
              disabled={pinInput.length < MIN_PIN_LENGTH}
              onPress={() => handleFirstPinDone(pinInput)}
            >
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Next</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.centerStep}>
          <ThemedText type="h2" style={{ fontWeight: "700", marginBottom: Spacing.xs }}>
            Confirm Your {pendingMode === "numeric" ? "PIN" : "Passcode"}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xl, textAlign: "center" }}>
            Re-enter to confirm
          </ThemedText>
          {pendingMode === "numeric" ? (
            <PinPad value={pinInput} onChange={(v) => { setError(null); setPinInput(v); }} maxLength={8} theme={theme} />
          ) : (
            <SimpleTextEntry value={pinInput} onChange={setPinInput} theme={theme} />
          )}
          {error ? <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.md }}>{error}</ThemedText> : null}
          <View style={styles.stepButtonRow}>
            <Pressable style={styles.cancelButton} onPress={resetFlow}>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, { backgroundColor: pinInput.length >= MIN_PIN_LENGTH ? theme.primary : theme.border }]}
              disabled={pinInput.length < MIN_PIN_LENGTH}
              onPress={() => handleConfirmPin(pinInput)}
            >
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
                {intent === "change" ? "Save" : "Turn On"}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function SimpleTextEntry({ value, onChange, theme }: { value: string; onChange: (v: string) => void; theme: any }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      secureTextEntry
      autoFocus
      placeholder="Passcode"
      placeholderTextColor={theme.textSecondary}
      style={[styles.alphaInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundTertiary }]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    fontWeight: "600",
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  centerStep: {
    alignItems: "center",
    paddingTop: Spacing.xl,
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  segment: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  alphaInput: {
    width: 280,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    textAlign: "center",
    letterSpacing: 2,
  },
  stepButtonRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  cancelButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  confirmButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
});
