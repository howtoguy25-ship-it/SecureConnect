import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/authTypes';
import { useAuth } from '@/context/AuthContext';
import { friendlyAuthError } from '@/utils/authErrors';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmailAuth'>;

export default function EmailAuthScreen({ navigation, route }: Props) {
  const { signUpWithEmail, signInWithEmail } = useAuth();
  const [mode, setMode] = useState<'signup' | 'signin'>(route.params.mode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (isSignUp && password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <View style={{ width: 26 }} />
        </View>

        <View style={styles.tabs}>
          <Pressable style={[styles.tab, isSignUp && styles.tabActive]} onPress={() => setMode('signup')}>
            <Text style={[styles.tabText, isSignUp && styles.tabTextActive]}>Sign Up</Text>
          </Pressable>
          <Pressable style={[styles.tab, !isSignUp && styles.tabActive]} onPress={() => setMode('signin')}>
            <Text style={[styles.tabText, !isSignUp && styles.tabTextActive]}>Sign In</Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder="••••••••"
            />
            <Pressable style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
            </Pressable>
          </View>

          {!isSignUp && (
            <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={{ alignSelf: 'flex-end' }}>
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </Pressable>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.submitButton} onPress={submit} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  tabs: { flexDirection: 'row', marginHorizontal: 24, marginTop: 12, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: { fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#0F172A' },
  form: { paddingHorizontal: 24, marginTop: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  eyeButton: { padding: 8 },
  forgotLink: { color: '#2563EB', fontSize: 13, fontWeight: '600', marginTop: 8 },
  error: { color: '#DC2626', fontSize: 13, marginTop: 12 },
  submitButton: {
    marginTop: 24,
    backgroundColor: '#111827',
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
