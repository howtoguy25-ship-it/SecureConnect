import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { sellerAccountStore, createSellerOnboardingLink, refreshSellerAccountStatus, createSellerDashboardLink } from '@/services/store';
import { SellerAccount } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerAccount'>;

export default function SellerAccountScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [account, setAccount] = useState<SellerAccount | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    return sellerAccountStore.subscribe(user.uid, setAccount);
  }, [user]);

  // Stripe's hosted onboarding closes back to the app (custom URL scheme) whether the
  // seller finishes or just backs out -- re-checking real status on focus, rather than
  // trusting that redirect, is what actually reflects whether Stripe will accept charges.
  useFocusEffect(
    useCallback(() => {
      refreshSellerAccountStatus().catch(() => {});
    }, [])
  );

  const handleSetUpPayouts = async () => {
    setBusy(true);
    try {
      const url = await createSellerOnboardingLink();
      await WebBrowser.openBrowserAsync(url);
      await refreshSellerAccountStatus();
    } catch (err: any) {
      showAlert('Could not start setup', err?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const handleViewDashboard = async () => {
    setBusy(true);
    try {
      const url = await createSellerDashboardLink();
      await WebBrowser.openBrowserAsync(url);
    } catch (err: any) {
      showAlert('Could not open dashboard', err?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const status = account?.onboardingStatus ?? 'not_connected';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>My Store & Payouts</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.card}>
        <Ionicons
          name={status === 'active' ? 'checkmark-circle' : status === 'pending' ? 'time-outline' : 'storefront-outline'}
          size={32}
          color={status === 'active' ? '#16A34A' : '#4338CA'}
        />
        <Text style={styles.statusTitle}>
          {status === 'active' ? 'Payouts are set up' : status === 'pending' ? 'Setup in progress' : 'Set up payouts to sell products'}
        </Text>
        <Text style={styles.statusBody}>
          {status === 'active'
            ? 'Money from your store sales goes straight to your own bank account via Stripe — SiteSpark never holds it.'
            : status === 'pending'
              ? "You've started setup with Stripe but haven't finished it yet — pick up where you left off."
              : 'Add product blocks to any page in the editor. To actually accept payment for them, connect a real Stripe account — takes a few minutes, handled entirely by Stripe.'}
        </Text>

        {busy ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : (
          <Pressable style={styles.primaryBtn} onPress={status === 'active' ? handleViewDashboard : handleSetUpPayouts}>
            <Text style={styles.primaryBtnText}>
              {status === 'active' ? 'View Stripe Dashboard' : status === 'pending' ? 'Continue Setup' : 'Set Up Payouts'}
            </Text>
          </Pressable>
        )}

        {status === 'active' && (
          <Pressable style={styles.secondaryBtn} onPress={handleSetUpPayouts}>
            <Text style={styles.secondaryBtnText}>Update account details</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.note}>SiteSpark takes an 8% platform fee on each order — the rest is transferred to you automatically.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  statusTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginTop: 12, textAlign: 'center' },
  statusBody: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 19 },
  primaryBtn: { backgroundColor: '#4338CA', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28, marginTop: 20 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  secondaryBtn: { marginTop: 12 },
  secondaryBtnText: { color: '#4338CA', fontWeight: '600', fontSize: 13 },
  note: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 20, paddingHorizontal: 32 },
});
