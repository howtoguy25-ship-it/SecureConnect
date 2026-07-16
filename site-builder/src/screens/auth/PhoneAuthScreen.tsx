import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/authTypes';
import { usePhoneVerification } from '@/hooks/usePhoneVerification';
import { friendlyAuthError } from '@/utils/authErrors';

type Props = NativeStackScreenProps<AuthStackParamList, 'PhoneAuth'>;

const E164 = /^\+[1-9]\d{6,14}$/;

export default function PhoneAuthScreen({ navigation }: Props) {
  const { recaptchaRef, RecaptchaModal, sendCode } = usePhoneVerification();
  const [phoneNumber, setPhoneNumber] = useState('+');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!E164.test(phoneNumber)) {
      setError('Enter your full number with country code, e.g. +61 408 680 813.');
      return;
    }
    setBusy(true);
    try {
      await sendCode(phoneNumber);
      navigation.navigate('PhoneVerify', { phoneNumber });
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
        <Text style={styles.title}>Sign Up with Phone</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.body}>We'll text you a verification code. Standard message rates may apply.</Text>
        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          placeholder="+61 408 680 813"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.submitButton} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Send Code</Text>}
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
});
