import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator, Image } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/authTypes';
import { useAuth } from '@/context/AuthContext';
import { friendlyAuthError } from '@/utils/authErrors';
import { env } from '@/config/env';

WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const { signInWithGoogleIdToken, signInWithAppleToken, signInWithGooglePopup, signInWithApplePopup } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  // expo-auth-session's native Google flow needs a real redirect scheme, which a browser
  // tab doesn't have — web signs in via Firebase's own popup flow instead (see handleGoogle).
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: env.google.iosClientId,
    webClientId: env.google.webClientId,
  });

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      setBusy(true);
      signInWithGoogleIdToken(response.params.id_token)
        .catch((err) => showAlert('Sign-in failed', friendlyAuthError(err)))
        .finally(() => setBusy(false));
    } else if (response?.type === 'error') {
      showAlert('Sign-in failed', response.error?.message ?? 'Google sign-in was cancelled.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const handleApple = async () => {
    try {
      setBusy(true);
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
      await signInWithAppleToken(credential.identityToken, rawNonce);
    } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') {
        showAlert('Sign-in failed', friendlyAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleWeb = async () => {
    try {
      setBusy(true);
      await signInWithGooglePopup();
    } catch (err: any) {
      // Firebase throws this if the user just closes the popup — not a real failure.
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        showAlert('Sign-in failed', friendlyAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAppleWeb = async () => {
    try {
      setBusy(true);
      await signInWithApplePopup();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        showAlert('Sign-in failed', friendlyAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    // Same dark-navy-with-color-glow palette as the buildsitespark.com marketing page
    // (marketingShell in siteHtml.ts) -- LinearGradient only does a straight axis, not a
    // radial glow, but this diagonal indigo-to-cyan sweep reads as the same brand family
    // instead of the flat single-color background this screen had before.
    <LinearGradient colors={['#1E1B4B', '#0B1220', '#082F36']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientRoot}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.hero}>
          {/* The real app logo (same asset as the App Store icon/splash screen) --
              already includes the "SiteSpark" wordmark, so no separate title text
              underneath it. */}
          <Image source={require('../../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.subtitle}>Build real sites, logos, and social pages — right from your phone.</Text>
        </View>

      <View style={styles.actions}>
        {busy && <ActivityIndicator style={{ marginBottom: 12 }} />}

        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={10}
            style={styles.appleButton}
            onPress={handleApple}
          />
        )}

        {isWeb && (
          <Pressable style={[styles.button, styles.darkButton]} onPress={handleAppleWeb}>
            <Ionicons name="logo-apple" size={18} color="#FFFFFF" />
            <Text style={styles.darkButtonText}>Continue with Apple</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.button, styles.googleButton]}
          disabled={!isWeb && !request}
          onPress={isWeb ? handleGoogleWeb : () => promptAsync()}
        >
          <Ionicons name="logo-google" size={18} color="#0F172A" />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.darkButton]}
          onPress={() => navigation.navigate('EmailAuth', { mode: 'signup' })}
        >
          <Ionicons name="mail-outline" size={18} color="#FFFFFF" />
          <Text style={styles.darkButtonText}>Continue with Email</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.outlineButton]} onPress={() => navigation.navigate('PhoneAuth')}>
          <Ionicons name="call-outline" size={18} color="#0F172A" />
          <Text style={styles.outlineButtonText}>Continue with Phone</Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('EmailAuth', { mode: 'signin' })}>
          <Text style={styles.signInLink}>Already have an account? Sign in</Text>
        </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientRoot: { flex: 1 },
  container: { flex: 1, justifyContent: 'space-between' },
  hero: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  logo: {
    width: 220,
    height: 220,
    marginBottom: 4,
  },
  subtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  actions: { padding: 24, gap: 12 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 10,
  },
  appleButton: { height: 50, borderRadius: 10 },
  googleButton: { backgroundColor: '#FFFFFF' },
  googleButtonText: { fontWeight: '600', color: '#0F172A' },
  darkButton: { backgroundColor: '#2563EB' },
  darkButtonText: { fontWeight: '600', color: '#FFFFFF' },
  outlineButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#1E293B' },
  outlineButtonText: { fontWeight: '600', color: '#0F172A' },
  signInLink: { textAlign: 'center', color: '#94A3B8', marginTop: 6, fontSize: 13 },
});
