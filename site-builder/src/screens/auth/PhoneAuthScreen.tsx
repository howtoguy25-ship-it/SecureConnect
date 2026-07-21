import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/authTypes';
import { usePhoneVerification } from '@/hooks/usePhoneVerification';
import { friendlyAuthError } from '@/utils/authErrors';
import CountryCodePicker from '@/components/CountryCodePicker';
import { COUNTRY_DIAL_CODES, DEFAULT_COUNTRY_ISO2 } from '@/data/countryCodes';

type Props = NativeStackScreenProps<AuthStackParamList, 'PhoneAuth'>;

const E164 = /^\+[1-9]\d{6,14}$/;
const DEFAULT_COUNTRY = COUNTRY_DIAL_CODES.find((c) => c.iso2 === DEFAULT_COUNTRY_ISO2)!;

export default function PhoneAuthScreen({ navigation }: Props) {
  const { recaptchaRef, RecaptchaModal, sendCode } = usePhoneVerification();
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [nationalNumber, setNationalNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const phoneNumber = `${country.dialCode}${nationalNumber.replace(/[^0-9]/g, '')}`;
    if (!E164.test(phoneNumber)) {
      setError('Enter your full phone number.');
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
        <Text style={styles.title}>Continue with Phone</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.body}>We'll text you a verification code. Standard message rates may apply.</Text>
        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.phoneRow}>
          <CountryCodePicker value={country} onChange={setCountry} />
          <TextInput
            style={styles.phoneInput}
            value={nationalNumber}
            onChangeText={(t) => setNationalNumber(t.replace(/[^0-9]/g, ''))}
            keyboardType="phone-pad"
            placeholder="Phone number"
          />
        </View>
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
  phoneRow: { flexDirection: 'row', gap: 10 },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
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
});
