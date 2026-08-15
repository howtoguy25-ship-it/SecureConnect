import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/authTypes';
import { useAuth } from '@/context/AuthContext';
import { usePhoneVerification } from '@/hooks/usePhoneVerification';
import { friendlyAuthError } from '@/utils/authErrors';

type Props = NativeStackScreenProps<AuthStackParamList, 'PhoneVerify'>;

const RESEND_COOLDOWN_SECONDS = 30;

export default function PhoneVerifyScreen({ navigation, route }: Props) {
  const { phoneNumber } = route.params;
  const { confirmPhoneCode } = useAuth();
  const { recaptchaRef, RecaptchaModal, sendCode } = usePhoneVerification();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const submit = async () => {
    setError(null);
    if (code.length < 6) {
      setError('Enter the 6-digit code we texted you.');
      return;
    }
    setBusy(true);
    try {
      await confirmPhoneCode(code);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError(null);
    setBusy(true);
    try {
      await sendCode(phoneNumber);
      setCooldown(RESEND_COOLDOWN_SECONDS);
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
        <Text style={styles.title}>Enter Code</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.body}>We sent a 6-digit code to {phoneNumber}.</Text>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="000000"
          maxLength={6}
          autoFocus
        />
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.submitButton} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Verify</Text>}
        </Pressable>

        <Pressable onPress={resend} disabled={cooldown > 0 || busy} style={{ marginTop: 20 }}>
          <Text style={[styles.resendText, cooldown > 0 && styles.resendTextDisabled]}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Text>
        </Pressable>
      </View>

      <RecaptchaModal ref={recaptchaRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  form: { paddingHorizontal: 24, marginTop: 20 },
  body: { fontSize: 14, color: '#64748B', marginBottom: 20, lineHeight: 20 },
  codeInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 14,
    fontSize: 24,
    letterSpacing: 12,
    textAlign: 'center',
    fontWeight: '700',
  },
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
  resendText: { textAlign: 'center', color: '#2563EB', fontWeight: '600', fontSize: 13 },
  resendTextDisabled: { color: '#94A3B8' },
});
