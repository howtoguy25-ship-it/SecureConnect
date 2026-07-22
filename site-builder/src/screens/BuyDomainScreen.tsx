import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { searchDomains, createDomainCheckout, DomainSearchResult } from '@/services/domains';
import { connectDomain, DomainResult } from '@/services/publish';
import { domainPurchaseStore } from '@/storage/domainPurchaseStore';
import { DomainPurchase, RegistrantContact } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyDomain'>;

type Step = 'search' | 'contact' | 'processing';

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

export default function BuyDomainScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const { projectId } = route.params;

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DomainSearchResult[]>([]);
  const [selected, setSelected] = useState<DomainSearchResult | null>(null);
  const [contact, setContact] = useState<RegistrantContact>(emptyContact);
  const [submitting, setSubmitting] = useState(false);
  const [purchase, setPurchase] = useState<DomainPurchase | null>(null);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  // Real DNS setup for the domain the user just bought, shown immediately once
  // registration completes -- instead of sending them to go re-type the same domain into
  // a separate "Connect a domain" field, this connects it automatically and surfaces the
  // real DNS records right here.
  const [connectingDomain, setConnectingDomain] = useState(false);
  const [dnsResult, setDnsResult] = useState<DomainResult | null>(null);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const autoConnectedRef = useRef<string | null>(null);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  useEffect(() => {
    if (purchase?.status !== 'registered') return;
    if (autoConnectedRef.current === purchase.domain) return;
    autoConnectedRef.current = purchase.domain;
    setConnectingDomain(true);
    connectDomain(projectId, purchase.domain)
      .then(setDnsResult)
      .catch((err: any) => setDnsError(err?.message ?? 'Could not set up DNS automatically.'))
      .finally(() => setConnectingDomain(false));
  }, [purchase?.status, purchase?.domain, projectId]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const found = await searchDomains(query.trim());
      setResults(found);
    } catch (err: any) {
      showAlert('Search failed', err?.message ?? 'Try again in a moment.');
    } finally {
      setSearching(false);
    }
  };

  const handlePickDomain = (result: DomainSearchResult) => {
    setSelected(result);
    setStep('contact');
  };

  const contactComplete =
    contact.firstName.trim() &&
    contact.lastName.trim() &&
    contact.address1.trim() &&
    contact.city.trim() &&
    contact.stateProvince.trim() &&
    contact.postalCode.trim() &&
    contact.country.trim().length === 2 &&
    contact.phone.trim() &&
    contact.emailAddress.trim();

  const handleBuy = async () => {
    if (!selected || !contactComplete) return;
    setSubmitting(true);
    try {
      const { purchaseId, checkoutUrl } = await createDomainCheckout(
        selected.domain,
        1,
        contact,
        projectId
      );
      setStep('processing');
      unsubscribeRef.current = domainPurchaseStore.subscribe(uid, purchaseId, setPurchase);
      await WebBrowser.openBrowserAsync(checkoutUrl);
    } catch (err: any) {
      showAlert('Could not start checkout', err?.message ?? 'Try again in a moment.');
      setStep('contact');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Buy a domain</Text>
        <View style={{ width: 26 }} />
      </View>

      {step === 'search' && (
        <View style={styles.content}>
          <Text style={styles.label}>Search for a domain</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="yourbrand"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleSearch}
            />
            <Pressable style={styles.searchButton} onPress={handleSearch} disabled={searching}>
              {searching ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="search" size={18} color="#FFFFFF" />}
            </Pressable>
          </View>

          <FlatList
            data={results}
            keyExtractor={(r) => r.domain}
            contentContainerStyle={{ gap: 10, marginTop: 16 }}
            ListEmptyComponent={
              !searching ? <Text style={styles.empty}>Search a name (or a full domain) to see real availability and pricing.</Text> : null
            }
            renderItem={({ item }) => (
              <Pressable style={styles.resultRow} onPress={() => handlePickDomain(item)}>
                <Text style={styles.resultDomain}>{item.domain}</Text>
                <Text style={styles.resultPrice}>${item.priceUsd.toFixed(2)}/yr</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {step === 'contact' && selected && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.label}>Registering {selected.domain} — ${selected.priceUsd.toFixed(2)}/yr</Text>
          <Text style={styles.helper}>
            Required by ICANN for every domain — this is who legally owns it. Free WHOIS privacy is included, so it
            won't be publicly visible.
          </Text>

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

          <Pressable style={styles.primaryButton} onPress={handleBuy} disabled={!contactComplete || submitting}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Continue to payment</Text>}
          </Pressable>
        </ScrollView>
      )}

      {step === 'processing' && (
        <View style={styles.content}>
          <View style={styles.card}>
            {(!purchase || purchase.status === 'pending') && (
              <>
                <ActivityIndicator color="#4338CA" />
                <Text style={styles.statusText}>Waiting for payment to complete...</Text>
              </>
            )}
            {purchase?.status === 'paid' && (
              <>
                <ActivityIndicator color="#4338CA" />
                <Text style={styles.statusText}>Payment received — registering your domain...</Text>
              </>
            )}
            {purchase?.status === 'registering' && (
              <>
                <ActivityIndicator color="#4338CA" />
                <Text style={styles.statusText}>Registering {purchase.domain} with the registrar...</Text>
              </>
            )}
            {purchase?.status === 'registered' && (
              <>
                <Ionicons name="checkmark-circle" size={28} color="#16A34A" />
                <Text style={styles.statusText}>{purchase.domain} is yours!</Text>

                {connectingDomain && (
                  <>
                    <ActivityIndicator color="#4338CA" />
                    <Text style={styles.statusText}>Setting up DNS to point it at your published site...</Text>
                  </>
                )}

                {!connectingDomain && dnsResult && (
                  <View style={{ width: '100%' }}>
                    <Text style={[styles.statusText, { textAlign: 'left', fontWeight: '700' }]}>
                      Your site is connecting to {purchase.domain} — status: {dnsResult.domainStatus ?? 'pending'}
                    </Text>
                    <Text style={[styles.helper, { marginTop: 6, marginBottom: 6 }]}>
                      DNS changes can take a few minutes to a few hours to fully propagate.
                    </Text>
                    {dnsResult.dnsRecords.map((record, i) => (
                      <View key={i} style={styles.dnsRow}>
                        <Text style={styles.dnsType}>{record.type}</Text>
                        <Text style={styles.dnsValue} selectable>
                          {record.domainName} → {record.requiredValue}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {!connectingDomain && dnsError && (
                  <Text style={[styles.statusText, { color: '#DC2626' }]}>{dnsError}</Text>
                )}

                <Pressable style={styles.primaryButton} onPress={() => navigation.goBack()}>
                  <Text style={styles.primaryButtonText}>Done</Text>
                </Pressable>
              </>
            )}
            {purchase?.status === 'failed' && (
              <>
                <Ionicons name="alert-circle" size={28} color="#DC2626" />
                <Text style={styles.statusText}>{purchase.errorMessage ?? 'Registration failed.'}</Text>
                <Pressable style={styles.primaryButton} onPress={() => setStep('search')}>
                  <Text style={styles.primaryButtonText}>Try again</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 20, flexGrow: 1 },
  label: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  helper: { fontSize: 12, color: '#64748B', marginBottom: 16, lineHeight: 18 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  searchButton: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#4338CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 30, lineHeight: 19 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
  },
  resultDomain: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  resultPrice: { fontSize: 13, fontWeight: '700', color: '#4338CA' },
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
    gap: 12,
  },
  statusText: { fontSize: 14, color: '#334155', textAlign: 'center', lineHeight: 20 },
  dnsRow: { marginTop: 10, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10 },
  dnsType: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  dnsValue: { fontSize: 12, color: '#0F172A', marginTop: 2 },
});
