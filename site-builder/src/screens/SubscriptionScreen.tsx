import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { PLANS, CREDIT_PACKS, computeBuildCost } from '@/data/pricing';
import { SUBSCRIPTION_PRODUCT_IDS, CREDIT_PACK_PRODUCT_IDS } from '@/data/iapProducts';
import { buySubscription, buyProduct, attachPurchaseListeners, loadIapCatalog, openBillingPortal } from '@/services/iap';
import { useAuth } from '@/context/AuthContext';
import { userAccountStore } from '@/storage/userAccountStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;

export default function SubscriptionScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [hasStripeBilling, setHasStripeBilling] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    if (!user || Platform.OS !== 'web') return;
    return userAccountStore.subscribe(user.uid, (account) => setHasStripeBilling(!!account?.stripeCustomerId));
  }, [user]);

  const handleManageBilling = async () => {
    setOpeningPortal(true);
    try {
      await openBillingPortal();
    } catch (err: any) {
      setOpeningPortal(false);
      showAlert('Could not open billing portal', err?.message ?? 'Try again in a moment.');
    }
  };
  // Real, localized prices from Apple, keyed by product id -- e.g. "$64.99" is only ever
  // our own guess (src/data/pricing.ts's priceLabel), which won't match what a given
  // customer is actually charged once regional/currency-base pricing is involved. Falls
  // back to that guess below if the catalog hasn't loaded yet (offline, IAP not
  // connected) so the screen never shows a blank price.
  const [livePrices, setLivePrices] = useState<Record<string, string>>({});

  useEffect(() => {
    loadIapCatalog()
      .then(({ subscriptions, products }) => {
        const prices: Record<string, string> = {};
        [...subscriptions, ...products].forEach((p) => {
          prices[p.id] = p.displayPrice;
        });
        setLivePrices(prices);
      })
      .catch(() => {
        // Leave livePrices empty -- the hardcoded priceLabel fallback below covers this.
      });
  }, []);

  // Stripe Checkout (web billing) redirects the whole tab away and back, so there's no
  // in-page purchase event the way StoreKit has one -- this reads the ?checkout= query
  // param the redirect leaves behind instead, once the page reloads on return.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (checkout === 'success') {
      showAlert('Payment received', 'Your credits/plan will update within a few seconds.');
    } else if (checkout === 'cancelled') {
      showAlert('Checkout cancelled', 'No charge was made.');
    }
  }, []);

  useEffect(() => {
    const detach = attachPurchaseListeners(
      () => {
        setPurchasingId(null);
        showAlert('Purchase complete', 'Your credits/plan have been updated.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      },
      (message) => {
        setPurchasingId(null);
        showAlert('Purchase failed', message);
      }
    );
    return detach;
  }, [navigation]);

  const handleSelectPlan = async (planId: keyof typeof SUBSCRIPTION_PRODUCT_IDS) => {
    setPurchasingId(planId);
    try {
      await buySubscription(SUBSCRIPTION_PRODUCT_IDS[planId]);
    } catch (err: any) {
      setPurchasingId(null);
      showAlert('Could not start purchase', err?.message ?? 'Try again in a moment.');
    }
  };

  const handleBuyPack = async (packId: string) => {
    const productId = CREDIT_PACK_PRODUCT_IDS[packId];
    if (!productId) return;
    setPurchasingId(packId);
    try {
      await buyProduct(productId);
    } catch (err: any) {
      setPurchasingId(null);
      showAlert('Could not start purchase', err?.message ?? 'Try again in a moment.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="close" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Out of Credits</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.intro}>
          Pick a monthly plan for ongoing credits, or buy a one-time pack to finish this build.
        </Text>

        {Platform.OS === 'web' && hasStripeBilling && (
          <Pressable style={styles.manageBillingBtn} onPress={handleManageBilling} disabled={openingPortal}>
            {openingPortal ? (
              <ActivityIndicator color="#4338CA" />
            ) : (
              <>
                <Ionicons name="card-outline" size={16} color="#4338CA" />
                <Text style={styles.manageBillingText}>Manage billing (update card, view invoices, cancel)</Text>
              </>
            )}
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>Plans</Text>
        {PLANS.map((plan) => (
          <View key={plan.id} style={styles.planCard}>
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>{livePrices[SUBSCRIPTION_PRODUCT_IDS[plan.id as keyof typeof SUBSCRIPTION_PRODUCT_IDS]] ?? plan.priceLabel}</Text>
            </View>
            <Text style={styles.planDetail}>
              {plan.monthlyCredits} credits {plan.billingPeriod === 'weekly-reset' ? '(resets weekly)' : '/mo'} · {plan.aiTierLabel}-tier AI ({plan.aiSpeedMultiplier}x)
            </Text>
            <Text style={styles.planDetail}>
              Per build: Simple {computeBuildCost(plan.id, 'simple')} · Professional {computeBuildCost(plan.id, 'standard')} · Go All Out {computeBuildCost(plan.id, 'crazy')} credits
            </Text>
            {plan.minimumUsageNote && <Text style={styles.planNote}>{plan.minimumUsageNote}</Text>}
            <Pressable
              style={styles.selectButton}
              onPress={() => handleSelectPlan(plan.id as keyof typeof SUBSCRIPTION_PRODUCT_IDS)}
              disabled={purchasingId === plan.id}
            >
              {purchasingId === plan.id ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.selectButtonText}>Select {plan.name}</Text>
              )}
            </Pressable>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Or buy a credit pack</Text>
        <View style={styles.packsGrid}>
          {CREDIT_PACKS.map((pack) => (
            <Pressable
              key={pack.id}
              style={styles.packCard}
              onPress={() => handleBuyPack(pack.id)}
              disabled={purchasingId === pack.id}
            >
              {purchasingId === pack.id ? (
                <ActivityIndicator color="#4338CA" />
              ) : (
                <>
                  <Text style={styles.packCredits}>{pack.credits}</Text>
                  <Text style={styles.packLabel}>credits</Text>
                  <Text style={styles.packPrice}>{livePrices[CREDIT_PACK_PRODUCT_IDS[pack.id]] ?? pack.priceLabel}</Text>
                </>
              )}
            </Pressable>
          ))}
        </View>

        <Text style={styles.demoNote}>
          {Platform.OS === 'web'
            ? 'Payments are processed securely by Stripe. Once you have an active plan, use "Manage billing" above to update your card, view invoices, or cancel any time.'
            : 'Payments are processed by Apple through In-App Purchase. Manage or cancel a subscription any time from your Apple ID settings.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  intro: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10, marginTop: 8 },
  manageBillingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 10,
    height: 44,
    marginBottom: 20,
  },
  manageBillingText: { color: '#4338CA', fontWeight: '700', fontSize: 13 },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  planPrice: { fontSize: 16, fontWeight: '800', color: '#4338CA' },
  planDetail: { fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 17 },
  planNote: { fontSize: 11, color: '#B45309', marginTop: 6 },
  selectButton: { marginTop: 12, backgroundColor: '#111827', borderRadius: 10, height: 44, alignItems: 'center', justifyContent: 'center' },
  selectButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  packsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  packCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  packCredits: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  packLabel: { fontSize: 11, color: '#94A3B8' },
  packPrice: { fontSize: 14, fontWeight: '700', color: '#4338CA', marginTop: 6 },
  demoNote: { fontSize: 11, color: '#94A3B8', marginTop: 24, textAlign: 'center', lineHeight: 16 },
});
