import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/authTypes';
import { useAuth } from '@/context/AuthContext';
import { friendlyAuthError } from '@/utils/authErrors';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter the email on your account.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Reset Password</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.form}>
        {sent ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={40} color="#16A34A" />
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successBody}>
              We sent a password reset link to {email.trim()}. Follow it to set a new password.
            </Text>
            <Pressable style={styles.submitButton} onPress={() => navigation.goBack()}>
              <Text style={styles.submitButtonText}>Back to Sign In</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.body}>Enter the email on your account and we'll send you a link to reset your password.</Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={styles.submitButton} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Send Reset Link</Text>}
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  form: { paddingHorizontal: 24, marginTop: 20 },
  body: { fontSize: 14, color: '#64748B', marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
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
  successBox: { alignItems: 'center', paddingTop: 30 },
  successTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginTop: 12 },
  successBody: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 19 },
});
