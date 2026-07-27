import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, TextInput, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { verifyCode, sendVerificationCode, storeAuth } from "@/lib/auth";
import { useAuth, ensureE2EEKeys } from "@/contexts/AuthContext";

type RouteProps = RouteProp<RootStackParamList, "VerifyCode">;

export default function VerifyCodeScreen() {
  const route = useRoute<RouteProps>();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { setUser, setToken } = useAuth();
  
  // Defensive: if navigation state is ever restored/corrupted without params
  // (a rare but real production crash vector), fall back to empty values and
  // show the error path instead of hard-crashing on undefined destructuring.
  const { phoneNumber = "", demoCode } = route.params ?? {};
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(60);
  const [demoApplied, setDemoApplied] = useState(false);
  
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const autoSubmitRef = useRef(false);

  useEffect(() => {
    if (demoCode && !demoApplied) {
      setDemoApplied(true);
      const digits = demoCode.split("");
      setCode(digits);
      autoSubmitRef.current = true;
    }
  }, [demoCode, demoApplied]);

  useEffect(() => {
    if (autoSubmitRef.current && code.every(d => d !== "")) {
      autoSubmitRef.current = false;
      const timer = setTimeout(() => handleVerify(), 500);
      return () => clearTimeout(timer);
    }
  }, [code]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleCodeChange = (text: string, index: number) => {
    if (text.length > 1) {
      const digits = text.replace(/\D/g, "").slice(0, 6 - index);
      const newCode = [...code];
      for (let i = 0; i < digits.length; i++) {
        if (index + i < 6) {
          newCode[index + i] = digits[i];
        }
      }
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newCode = [...code];
    newCode[index] = text.replace(/\D/g, "");
    setCode(newCode);
    setError("");

    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Guard against re-entry: this screen previously could fire `handleVerify`
  // twice in quick succession (the auto-submit useEffect on `code` PLUS the
  // user tapping the Verify button, or the duplicate effect that previously
  // existed at the bottom of this file). Two parallel /verify-code calls
  // would race — the first marked the OTP as consumed, the second hit
  // "Invalid verification code" and surfaced an error to the user even
  // though the login actually succeeded. The user then "clicked again" and
  // it worked because a fresh code had been resent. submittingRef prevents
  // any second invocation while the first is still in flight.
  const submittingRef = useRef(false);

  const handleVerify = async () => {
    if (submittingRef.current || isLoading) return;
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the complete code");
      return;
    }

    submittingRef.current = true;
    setIsLoading(true);
    setError("");

    try {
      const result = await verifyCode(phoneNumber, fullCode);

      if (result.success && result.token && result.user) {
        setToken(result.token);
        try {
          await ensureE2EEKeys(result.token);
        } catch (e) {
          console.log("E2EE setup failed:", e);
        }
        setUser(result.user);
        // Don't clear submittingRef on success — we're navigating away.
        return;
      }

      setError(result.error || "Invalid verification code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (e: any) {
      setError(e?.message || "Network error. Please check your connection and try again.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || isLoading) return;

    setError("");
    setResendTimer(60);
    const result = await sendVerificationCode(phoneNumber);
    if (!result.success) {
      setResendTimer(0);
      setError(result.error || "Couldn't resend the code. Please try again.");
    }
  };

  const isComplete = code.every((digit) => digit !== "");

  // Auto-submit once all 6 digits are entered. The submittingRef inside
  // handleVerify makes this safe to fire alongside the demoCode auto-submit
  // effect above and a manual Verify-button tap.
  useEffect(() => {
    if (isComplete && !isLoading) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
        },
      ]}
    >
      <View style={styles.form}>
        <ThemedText type="h2" style={styles.title}>
          Enter verification code
        </ThemedText>
        
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          We sent a 6-digit code to {phoneNumber}
        </ThemedText>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              style={[
                styles.codeInput,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                  borderColor: error ? theme.error : digit ? theme.primary : "transparent",
                },
              ]}
              value={digit}
              onChangeText={(text) => handleCodeChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={6}
              selectTextOnFocus
              editable={!isLoading}
              autoFocus={index === 0}
            />
          ))}
        </View>

        {error ? (
          <ThemedText type="small" style={[styles.error, { color: theme.error }]}>
            {error}
          </ThemedText>
        ) : null}

        <Pressable onPress={handleResend} disabled={resendTimer > 0}>
          <ThemedText
            type="body"
            style={[
              styles.resendText,
              { color: resendTimer > 0 ? theme.textSecondary : theme.primary },
            ]}
          >
            {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend code"}
          </ThemedText>
        </Pressable>
      </View>

      <Button
        onPress={handleVerify}
        disabled={!isComplete || isLoading}
        style={styles.button}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : "Verify"}
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
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.xl,
  },
  codeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderRadius: BorderRadius.sm,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    borderWidth: 2,
  },
  error: {
    textAlign: "center",
  },
  resendText: {
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  button: {
    marginTop: Spacing.xl,
  },
});
