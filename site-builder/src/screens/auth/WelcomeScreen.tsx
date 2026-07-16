import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const { signInWithGoogleIdToken, signInWithAppleToken } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: env.google.iosClientId,
    webClientId: env.google.webClientId,
  });

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      setBusy(true);
      signInWithGoogleIdToken(response.params.id_token)
        .catch((err) => Alert.alert('Sign-in failed', friendlyAuthError(err)))
        .finally(() => setBusy(false));
    } else if (response?.type === 'error') {
      Alert.alert('Sign-in failed', response.error?.message ?? 'Google sign-in was cancelled.');
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
        Alert.alert('Sign-in failed', friendlyAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="sparkles" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>SiteForge</Text>
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

        <Pressable
          style={[styles.button, styles.googleButton]}
          disabled={!request}
          onPress={() => promptAsync()}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1220', justifyContent: 'space-between' },
  hero: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 30, fontWeight: '800', color: '#FFFFFF' },
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
