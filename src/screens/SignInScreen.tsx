import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, GoogleSigninButton, isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  signInWithAppleCredential,
  signInWithGoogleCredential,
  signInWithEmail,
  signUpWithEmail,
} from "@/services/firebase";
import { env } from "@/config/env";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import type { RootStackParamList } from "@/navigation/RootNavigator";

// Real Firebase-backed sign-in (Google/Apple/Email), optional -- the app already works fully
// signed in anonymously (see firebase.ts's ensureSignedIn), this just upgrades that same
// session to a real identity so it's recoverable across devices/reinstalls. Phone number
// sign-in is deliberately not offered here: Firebase's phone auth needs a browser reCAPTCHA
// that doesn't exist in a native app, unlike Google/Apple/Email which all work the same way
// on mobile as they logically do on web.
export function SignInScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  useEffect(() => {
    if (!env.googleIosClientId) return;
    GoogleSignin.configure({ iosClientId: env.googleIosClientId });
  }, []);

  const onAppleSignIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("Apple didn't return an identity token -- try again.");
      }
      await signInWithAppleCredential(credential.identityToken);
      navigation.goBack();
    } catch (err: any) {
      // A real, expected outcome (user tapped Cancel on the system sheet), not an error to
      // show -- matches how the Google branch below treats its own cancel code.
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      setError(err instanceof Error ? err.message : "Apple sign-in failed.");
    } finally {
      setBusy(false);
    }
  }, [navigation]);

  const onGoogleSignIn = useCallback(async () => {
    setError(null);
    if (!env.googleIosClientId) {
      setError("Google sign-in isn't configured for this build yet.");
      return;
    }
    setBusy(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type !== "success" || !response.data.idToken) {
        return; // user cancelled the native sheet -- not an error
      }
      await signInWithGoogleCredential(response.data.idToken);
      navigation.goBack();
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return;
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }, [navigation]);

  const onEmailSubmit = useCallback(async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter an email and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
      navigation.goBack();
    } catch (err: any) {
      const code = err?.code as string | undefined;
      const message =
        code === "auth/invalid-email"
          ? "That email address doesn't look right."
          : code === "auth/wrong-password" || code === "auth/invalid-credential"
            ? "Incorrect email or password."
            : code === "auth/email-already-in-use"
              ? "That email already has an account -- try signing in instead."
              : code === "auth/weak-password"
                ? "Password must be at least 6 characters."
                : err instanceof Error
                  ? err.message
                  : "Something went wrong.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [email, password, mode, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>
        Optional -- TrackLine already works fully without an account. Signing in just makes your
        reports and settings recoverable if you get a new phone.
      </Text>

      {Platform.OS === "ios" && appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radius.md}
          style={styles.appleButton}
          onPress={onAppleSignIn}
        />
      )}

      <GoogleSigninButton
        style={styles.googleButton}
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Light}
        onPress={onGoogleSignIn}
        disabled={busy}
      />
      {!env.googleIosClientId && (
        <Text style={styles.disabledNote}>Google sign-in isn't configured for this build yet.</Text>
      )}

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.textFaint}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        style={styles.input}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && { opacity: pressedOpacity }]}
        onPress={onEmailSubmit}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {mode === "signup" ? "Create account" : "Sign in"}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setError(null);
          setMode((m) => (m === "signup" ? "signin" : "signup"));
        }}
        hitSlop={8}
      >
        <Text style={styles.switchModeText}>
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  appleButton: {
    height: 48,
    width: "100%",
  },
  googleButton: {
    width: "100%",
    height: 48,
  },
  disabledNote: {
    fontSize: 12,
    color: colors.textFaint,
    textAlign: "center",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: colors.textFaint,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
    fontSize: 15,
    color: colors.text,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.low,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  switchModeText: {
    fontSize: 13,
    color: colors.accent,
    textAlign: "center",
    fontWeight: "600",
    marginTop: spacing.xs,
  },
});
