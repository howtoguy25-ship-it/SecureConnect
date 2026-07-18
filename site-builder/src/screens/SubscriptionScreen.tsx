import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { PLANS, CREDIT_PACKS } from '@/data/pricing';
import { SUBSCRIPTION_PRODUCT_IDS, CREDIT_PACK_PRODUCT_IDS } from '@/data/iapProducts';
import { buySubscription, buyProduct, attachPurchaseListeners } from '@/services/iap';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;

export default function SubscriptionScreen({ navigation }: Props) {
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  useEffect(() => {
    const detach = attachPurchaseListeners(
      () => {
        setPurchasingId(null);
        Alert.alert('Purchase complete', 'Your credits/plan have been updated.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      },
      (message) => {
        setPurchasingId(null);
        Alert.alert('Purchase failed', message);
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
      Alert.alert('Could not start purchase', err?.message ?? 'Try again in a moment.');
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
      Alert.alert('Could not start purchase', err?.message ?? 'Try again in a moment.');
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

        <Text style={styles.sectionTitle}>Plans</Text>
        {PLANS.map((plan) => (
          <View key={plan.id} style={styles.planCard}>
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>{plan.priceLabel}</Text>
            </View>
            <Text style={styles.planDetail}>
              {plan.monthlyCredits} credits {plan.billingPeriod === 'weekly-reset' ? '(resets weekly)' : '/mo'} · builds cost{' '}
              {plan.buildCostRange[0]}-{plan.buildCostRange[1]} credits · {plan.aiTierLabel}-tier AI ({plan.aiSpeedMultiplier}x)
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
                  <Text style={styles.packPrice}>{pack.priceLabel}</Text>
                </>
              )}
            </Pressable>
          ))}
        </View>

        <Text style={styles.demoNote}>
          Payments are processed by Apple through In-App Purchase. Manage or cancel a
          subscription any time from your Apple ID settings.
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
