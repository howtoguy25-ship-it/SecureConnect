import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Localization from 'expo-localization';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import {
  sellerAccountStore,
  createSellerOnboardingLink,
  refreshSellerAccountStatus,
  createSellerDashboardLink,
  resetSellerOnboarding,
  setShippingFee,
} from '@/services/store';
import { SellerAccount } from '@/types';

// The seller's own device region, e.g. "AU" -- Stripe fixes an Express account's country
// permanently at creation, so this has to be right the first time (see createSellerOnboardingLink
// in services/store.ts for why). Falls back to US, Stripe's own default, if the device
// somehow reports no region (observed on some web browsers).
function deviceCountry(): string {
  const region = Localization.getLocales()[0]?.regionCode;
  return region && /^[A-Z]{2}$/i.test(region) ? region.toUpperCase() : 'US';
}

type Props = NativeStackScreenProps<RootStackParamList, 'SellerAccount'>;

export default function SellerAccountScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [account, setAccount] = useState<SellerAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [shippingFeeInput, setShippingFeeInput] = useState('');
  const [savingShippingFee, setSavingShippingFee] = useState(false);

  useEffect(() => {
    if (!user) return;
    return sellerAccountStore.subscribe(user.uid, setAccount);
  }, [user]);

  useEffect(() => {
    setShippingFeeInput(account?.shippingFeeUsd != null ? String(account.shippingFeeUsd) : '');
  }, [account?.shippingFeeUsd]);

  const handleSaveShippingFee = async () => {
    const trimmed = shippingFeeInput.trim();
    const value = trimmed ? parseFloat(trimmed) : null;
    if (trimmed && (!Number.isFinite(value) || (value as number) < 0)) {
      showAlert('Invalid amount', 'Enter a shipping fee of 0 or more, or leave it blank for no fee.');
      return;
    }
    setSavingShippingFee(true);
    try {
      await setShippingFee(value);
    } catch (err: any) {
      showAlert('Could not save shipping fee', err?.message ?? 'Try again in a moment.');
    } finally {
      setSavingShippingFee(false);
    }
  };

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
      const url = await createSellerOnboardingLink(deviceCountry());
      await WebBrowser.openBrowserAsync(url);
      await refreshSellerAccountStatus();
    } catch (err: any) {
      showAlert('Could not start setup', err?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  // Recovers a seller stuck on a broken Stripe onboarding (most often: the account was
  // created under the wrong country, which Stripe never allows changing afterward) by
  // abandoning that account and letting them start completely fresh.
  const handleStartOver = () => {
    showAlert('Start over?', "This abandons your current in-progress Stripe setup so you can begin again. You haven't lost anything -- it hasn't gone live yet.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start Over',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await resetSellerOnboarding();
            await refreshSellerAccountStatus();
          } catch (err: any) {
            showAlert('Could not reset', err?.message ?? 'Try again in a moment.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
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

        {status === 'pending' && !busy && (
          <Pressable style={styles.secondaryBtn} onPress={handleStartOver}>
            <Text style={styles.secondaryBtnText}>Setup stuck or showing an error? Start over</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.shippingTitle}>Shipping fee</Text>
        <Text style={styles.statusBody}>
          A flat fee added at checkout whenever a buyer's order needs real shipping. Leave blank for no shipping fee.
        </Text>
        <View style={styles.shippingRow}>
          <Text style={styles.shippingDollar}>$</Text>
          <TextInput
            style={styles.shippingInput}
            value={shippingFeeInput}
            onChangeText={setShippingFeeInput}
            placeholder="0.00"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
          />
        </View>
        {savingShippingFee ? (
          <ActivityIndicator style={{ marginTop: 12 }} />
        ) : (
          <Pressable style={styles.secondaryBtn} onPress={handleSaveShippingFee}>
            <Text style={styles.secondaryBtnText}>Save shipping fee</Text>
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
  shippingTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  shippingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    width: '100%',
  },
  shippingDollar: { fontSize: 15, fontWeight: '700', color: '#64748B', marginRight: 4 },
  shippingInput: { flex: 1, fontSize: 15, color: '#0F172A', paddingVertical: 10 },
});
