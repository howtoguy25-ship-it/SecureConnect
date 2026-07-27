import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Linking, Alert, ActivityIndicator, Platform } from 'react-native';
import Constants from 'expo-constants';
import { ThemedText } from './ThemedText';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { apiRequest } from '@/lib/query-client';
import { iapService } from '@/services/InAppPurchaseService';
import { BannerAd as BannerAdComponent, BannerAdSize, isAdMobAvailable } from '@/utils/admobModule';

interface AdBannerProps {
  onRemoveAds?: () => void;
}

const TEST_BANNER_AD_UNIT_ID = Platform.select({
  ios: 'ca-app-pub-3940256099942544/2934735716',
  android: 'ca-app-pub-3940256099942544/6300978111',
  default: '',
}) as string;

const PROD_BANNER_AD_UNIT_ID =
  (Constants.expoConfig?.extra as any)?.admob?.bannerAdUnitId ?? '';

const BANNER_AD_UNIT_ID = __DEV__ ? TEST_BANNER_AD_UNIT_ID : PROD_BANNER_AD_UNIT_ID;

export function AdBanner({ onRemoveAds }: AdBannerProps) {
  const { user, refreshUser } = useAuth();
  const { theme: colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [adFailed, setAdFailed] = useState(false);
  // StoreKit-localized price for Remove Ads IAP. Null until loaded or when
  // unavailable (web/Expo Go) — we fall back to a generic CTA in that case
  // rather than showing a hardcoded currency that may not match the user's
  // App Store storefront (Apple Guideline 2.3.1 — Accurate Metadata).
  const [removeAdsPrice, setRemoveAdsPrice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const price = await iapService.getRemoveAdsLocalizedPrice();
      if (!cancelled) setRemoveAdsPrice(price);
    })();
    return () => { cancelled = true; };
  }, []);
  // Apple guideline 5.1.2 (ATT) + Google UMP / GDPR: we must request
  // non-personalized ads only when EITHER the iOS user denied tracking OR the
  // EEA/UK/CH user has not granted personalized-ads consent via UMP. We
  // default to `true` (the safer value) until both gates confirm permission
  // — a race on first launch can never result in personalized ads to a
  // denier on either axis.
  const [nonPersonalizedOnly, setNonPersonalizedOnly] = useState(true);
  // Hard gate: when UMP says canRequestAds=false (GDPR-regulated user refused
  // basic-functionality consent) we must not mount BannerAd at all. Setting
  // nonPersonalizedOnly is not enough — Google policy says no ad request.
  const [umpBlocksAds, setUmpBlocksAds] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Gate A — Apple ATT on iOS. Android/web treat as granted.
      let attGranted = true;
      if (Platform.OS === 'ios') {
        try {
          const { getTrackingPermissionsAsync } = await import('expo-tracking-transparency');
          const { status } = await getTrackingPermissionsAsync();
          attGranted = status === 'granted';
        } catch {
          attGranted = false;
        }
      }
      // Gate B — Google UMP. In non-regulated regions canRequestAds is true
      // with no user prompt. In EEA/UK/CH it reflects the user's choice.
      let umpAllowsPersonalized = true;
      let canRequestAds = true;
      if (Platform.OS !== 'web') {
        try {
          const { AdsConsent } = await import('react-native-google-mobile-ads');
          const info = await AdsConsent.getConsentInfo();
          if (info?.canRequestAds === false) {
            canRequestAds = false;
            umpAllowsPersonalized = false;
          } else {
            // Personalized requires purpose 1 (storage) + purpose 3 (personalized ads).
            const purposes = await AdsConsent.getPurposeConsents();
            const arr = (purposes ?? '').split('');
            umpAllowsPersonalized = arr[0] === '1' && arr[2] === '1';
          }
        } catch {
          umpAllowsPersonalized = false;
        }
      }
      if (!cancelled) {
        setUmpBlocksAds(!canRequestAds);
        setNonPersonalizedOnly(!(attGranted && umpAllowsPersonalized));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (user?.isAdFree) {
    return null;
  }

  if (user?.isVip) {
    if (!user.vipStartedAt) {
      return null;
    }
    const vipStart = new Date(user.vipStartedAt);
    const threeMonthsLater = new Date(vipStart);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    if (new Date() < threeMonthsLater) {
      return null;
    }
  }

  const handleRemoveAds = async () => {
    if (onRemoveAds) {
      onRemoveAds();
      return;
    }

    setIsLoading(true);

    // App Store Guideline 3.1.1: on iOS we MUST use Apple In-App Purchase only.
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      if (!iapService.isAvailable()) {
        setIsLoading(false);
        Alert.alert(
          'Purchases Unavailable',
          'In-app purchases are not available on this device right now. Please update the app from the App Store and try again.'
        );
        return;
      }
      try {
        await iapService.purchaseRemoveAds(
          async () => {
            setIsLoading(false);
            await refreshUser();
            Alert.alert('Success', 'Ads have been removed. Thank you for your purchase!');
          },
          (error: string) => {
            setIsLoading(false);
            Alert.alert('Purchase Failed', error);
          }
        );
      } catch {
        setIsLoading(false);
        Alert.alert('Error', 'Unable to start purchase. Please try again.');
      }
      return;
    }

    // Web only: Stripe Checkout.
    try {
      const response = await apiRequest('POST', '/api/stripe/checkout/remove-ads');
      const data = await response.json();
      if (data.url && typeof window !== 'undefined') {
        window.open(data.url, '_blank');
      }
    } catch {
      Alert.alert('Error', 'Unable to start checkout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const canShowAdMob =
    isAdMobAvailable && BannerAdComponent && BannerAdSize && !adFailed && BANNER_AD_UNIT_ID && !umpBlocksAds;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
      {canShowAdMob ? (
        <View style={styles.adWrapper}>
          <BannerAdComponent
            unitId={BANNER_AD_UNIT_ID}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{
              requestNonPersonalizedAdsOnly: nonPersonalizedOnly,
            }}
            onAdFailedToLoad={() => setAdFailed(true)}
          />
          <Pressable
            style={[styles.removeChip, { backgroundColor: colors.backgroundDefault, borderColor: colors.border }]}
            onPress={handleRemoveAds}
            disabled={isLoading}
            hitSlop={8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <ThemedText style={[styles.removeChipText, { color: colors.text }]}>
                Remove Ads
              </ThemedText>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={[styles.fallbackBanner, { backgroundColor: colors.backgroundDefault, borderColor: colors.border }]}>
          <View style={styles.adContent}>
            <View style={styles.adTextContainer}>
              <ThemedText style={[styles.adText, { color: colors.text }]}>
                Enjoying Pryvo?
              </ThemedText>
              <ThemedText style={[styles.adSubtext, { color: colors.textSecondary }]}>
                {removeAdsPrice
                  ? `Remove ads forever for ${removeAdsPrice}`
                  : 'Remove ads forever'}
              </ThemedText>
            </View>
          </View>
          <Pressable
            style={[styles.removeButton, { backgroundColor: colors.primary }]}
            onPress={handleRemoveAds}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="x-circle" size={14} color="#FFFFFF" />
                <ThemedText style={styles.removeButtonText}>Remove Ads</ThemedText>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: Spacing.md,
  },
  adWrapper: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  removeChip: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  removeChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fallbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  adContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  adLabel: {
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  adLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFC107',
  },
  adTextContainer: {
    flex: 1,
  },
  adText: {
    fontSize: 13,
    fontWeight: '600',
  },
  adSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 4,
    minWidth: 100,
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
