import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { startDomainTransfer, getDomainTransferStatus } from '@/services/domains';
import { DomainTransfer, RegistrantContact } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TransferDomain'>;

const emptyContact: RegistrantContact = {
  firstName: '',
  lastName: '',
  address1: '',
  city: '',
  stateProvince: '',
  postalCode: '',
  country: '',
  phone: '',
  emailAddress: '',
};

export default function TransferDomainScreen({ navigation }: Props) {
  const [domain, setDomain] = useState('');
  const [eppCode, setEppCode] = useState('');
  const [contact, setContact] = useState<RegistrantContact>(emptyContact);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [transfer, setTransfer] = useState<DomainTransfer | null>(null);

  const contactComplete =
    domain.trim() &&
    eppCode.trim() &&
    contact.firstName.trim() &&
    contact.lastName.trim() &&
    contact.address1.trim() &&
    contact.city.trim() &&
    contact.stateProvince.trim() &&
    contact.postalCode.trim() &&
    contact.country.trim().length === 2 &&
    contact.phone.trim() &&
    contact.emailAddress.trim();

  const handleStart = async () => {
    if (!contactComplete) return;
    setSubmitting(true);
    try {
      const result = await startDomainTransfer(domain.trim().toLowerCase(), eppCode.trim(), contact);
      setTransfer(result);
    } catch (err: any) {
      Alert.alert('Could not start transfer', err?.message ?? 'Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!transfer) return;
    setChecking(true);
    try {
      const result = await getDomainTransferStatus(transfer.id);
      setTransfer(result);
    } catch (err: any) {
      Alert.alert('Could not check status', err?.message ?? 'Try again in a moment.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Transfer a domain in</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!transfer ? (
          <>
            <Text style={styles.helper}>
              Move a domain you already own at another registrar into this account. It needs to be
              unlocked there first, and you'll need its EPP/auth code — your current registrar's
              dashboard or support can give you that. Transfers are approved by your losing registrar
              and can take up to 5–7 days by ICANN rule, not something any app can speed up.
            </Text>

            <Text style={styles.fieldLabel}>Domain</Text>
            <TextInput
              style={styles.input}
              value={domain}
              onChangeText={setDomain}
              placeholder="yourdomain.com"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldLabel}>EPP / Auth Code</Text>
            <TextInput style={styles.input} value={eppCode} onChangeText={setEppCode} autoCapitalize="none" autoCorrect={false} />

            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Registrant contact</Text>
            <TextInput style={styles.input} placeholder="First name" value={contact.firstName} onChangeText={(v) => setContact({ ...contact, firstName: v })} />
            <TextInput style={styles.input} placeholder="Last name" value={contact.lastName} onChangeText={(v) => setContact({ ...contact, lastName: v })} />
            <TextInput style={styles.input} placeholder="Address" value={contact.address1} onChangeText={(v) => setContact({ ...contact, address1: v })} />
            <TextInput style={styles.input} placeholder="City" value={contact.city} onChangeText={(v) => setContact({ ...contact, city: v })} />
            <TextInput style={styles.input} placeholder="State / Province" value={contact.stateProvince} onChangeText={(v) => setContact({ ...contact, stateProvince: v })} />
            <TextInput style={styles.input} placeholder="Postal code" value={contact.postalCode} onChangeText={(v) => setContact({ ...contact, postalCode: v })} />
            <TextInput
              style={styles.input}
              placeholder="Country code (e.g. AU, US)"
              value={contact.country}
              onChangeText={(v) => setContact({ ...contact, country: v.toUpperCase().slice(0, 2) })}
              autoCapitalize="characters"
              maxLength={2}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone (+61.412345678)"
              value={contact.phone}
              onChangeText={(v) => setContact({ ...contact, phone: v })}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={contact.emailAddress}
              onChangeText={(v) => setContact({ ...contact, emailAddress: v })}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Pressable style={styles.primaryButton} onPress={handleStart} disabled={!contactComplete || submitting}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Start Transfer</Text>}
            </Pressable>
          </>
        ) : (
          <View style={styles.card}>
            <Ionicons name="swap-horizontal" size={28} color="#4338CA" />
            <Text style={styles.statusDomain}>{transfer.domain}</Text>
            <Text style={styles.statusText}>{transfer.statusDescription}</Text>
            <Pressable style={styles.primaryButton} onPress={handleCheckStatus} disabled={checking}>
              {checking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Check status</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 20, flexGrow: 1 },
  helper: { fontSize: 13, color: '#64748B', marginBottom: 18, lineHeight: 19 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: '#4338CA',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  statusDomain: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 6 },
  statusText: { fontSize: 13, color: '#64748B', textAlign: 'center' },
});
