import React, { useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Linking, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";
import { iapService } from "@/services/InAppPurchaseService";

const VIP_FEATURES = [
  { icon: "lock" as const, title: "Hidden Message Locker", description: "Store private messages and photos in a PIN-protected vault" },
  { icon: "map-pin" as const, title: "Real-Time Location Sharing", description: "Share your live location with friends and see where they are on a map" },
  { icon: "image" as const, title: "Custom Chat Backgrounds", description: "Personalize your conversations with custom background images" },
  { icon: "eye-off" as const, title: "Ad-Free Experience", description: "Enjoy Pryvo without any advertisements" },
  { icon: "phone" as const, title: "Virtual Phone Number", description: "Get a dedicated app-only number for private communication" },
];

export default function VipUpgradeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  // StoreKit-localized price for VIP Monthly subscription. Null until loaded
  // or when unavailable (web/Expo Go) — fall back to a generic CTA so we
  // never show a hardcoded currency that contradicts the user's storefront
  // price (Apple Guideline 2.3.1 — Accurate Metadata).
  const [vipPrice, setVipPrice] = useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const price = await iapService.getVipMonthlyLocalizedPrice();
      if (!cancelled) setVipPrice(price);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRestore = async () => {
    if (Platform.OS === 'web' || !iapService.isAvailable()) {
      Alert.alert('Not Available', 'Purchase restoration is only available on iOS and Android.');
      return;
    }
    setIsRestoring(true);
    try {
      await iapService.restorePurchases(
        async () => {
          setIsRestoring(false);
          await refreshUser();
          Alert.alert('Purchases Restored', 'Your previous purchases have been restored.');
        },
        () => {
          setIsRestoring(false);
          Alert.alert('Nothing to Restore', 'No previous purchases were found for this Apple ID.');
        },
      );
    } catch {
      setIsRestoring(false);
      Alert.alert('Restore Failed', 'We could not restore your purchases. Please try again.');
    }
  };

  const openLegalPage = async (path: string) => {
    const url = new URL(path, getApiUrl()).toString();
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch {
      Linking.openURL(url).catch(() => {});
    }
  };

  const handleSubscribe = async () => {
    setIsLoading(true);

    // App Store Guideline 3.1.1: on iOS we MUST use Apple In-App Purchase only.
    // Never open Stripe / external payment URLs from inside the iOS app.
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
        await iapService.purchaseVipMonthly(
          async () => {
            setIsLoading(false);
            await refreshUser();
            Alert.alert('Welcome to VIP!', 'You now have access to all exclusive features.');
          },
          (error: string) => {
            setIsLoading(false);
            Alert.alert('Purchase Failed', error);
          }
        );
      } catch (error: any) {
        setIsLoading(false);
        Alert.alert('Error', 'Unable to start purchase. Please try again.');
      }
      return;
    }

    // Web only: Stripe Checkout.
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetchWithTimeout(new URL('/api/stripe/checkout', baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const { url } = await response.json();
        if (url && typeof window !== 'undefined') {
          window.open(url, '_blank');
        }
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      Alert.alert('Error', 'Unable to start checkout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (user?.isVip) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, { backgroundColor: theme.accent }]}>
              <Feather name="award" size={48} color="#fff" />
            </View>
            <ThemedText type="h2" style={styles.successTitle}>
              You're a VIP Member
            </ThemedText>
            <ThemedText type="body" style={[styles.successText, { color: theme.textSecondary }]}>
              Thank you for your support! Enjoy all the exclusive features.
            </ThemedText>
          </View>
        </View>
        
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Button onPress={() => navigation.goBack()}>
            Continue
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: Spacing.xl }]}
      >
        <View style={styles.header}>
          <View style={[styles.vipBadge, { backgroundColor: theme.accent }]}>
            <Feather name="award" size={48} color="#fff" />
          </View>
          
          <ThemedText type="h2" style={styles.title}>
            Upgrade to VIP
          </ThemedText>
          
          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            Unlock exclusive features and take your messaging to the next level
          </ThemedText>
        </View>

        <View style={styles.features}>
          {VIP_FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: theme.backgroundDefault }]}>
                <Feather name={feature.icon} size={24} color={theme.accent} />
              </View>
              <View style={styles.featureContent}>
                <ThemedText type="body" style={styles.featureTitle}>
                  {feature.title}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {feature.description}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.priceCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.priceHeader}>
            {vipPrice ? (
              <>
                <ThemedText type="h1" style={[styles.price, { color: theme.accent }]}>
                  {vipPrice}
                </ThemedText>
                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                  /month
                </ThemedText>
              </>
            ) : (
              <ThemedText type="h1" style={[styles.price, { color: theme.accent }]}>
                Monthly
              </ThemedText>
            )}
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
            Cancel anytime. {Platform.OS === 'web' ? 'Secure payment via Stripe.' : 'Secure payment via Apple.'}
          </ThemedText>
        </View>

        {Platform.OS !== 'web' && (
          <View style={styles.disclosureCard}>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", lineHeight: 18 }}>
              Pryvo VIP is an auto-renewable subscription. Payment will be charged to your Apple Account at confirmation of purchase. Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period at the cost shown above. You can manage and cancel your subscriptions by going to your Apple Account settings on the App Store after purchase.
            </ThemedText>
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
      
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Button
          onPress={handleSubscribe}
          disabled={isLoading || isRestoring}
          style={{ backgroundColor: theme.accent }}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : "Unlock VIP Access"}
        </Button>

        {Platform.OS !== 'web' && (
          <Pressable
            onPress={handleRestore}
            disabled={isLoading || isRestoring}
            style={styles.restoreButton}
          >
            {isRestoring ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <ThemedText type="small" style={{ color: theme.accent, fontWeight: "600" }}>
                Restore Purchases
              </ThemedText>
            )}
          </Pressable>
        )}

        <View style={styles.legalLinks}>
          <Pressable onPress={() => openLegalPage('/terms')}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Terms of Service
            </ThemedText>
          </Pressable>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {" | "}
          </ThemedText>
          <Pressable onPress={() => openLegalPage('/privacy')}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Privacy Policy
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing["2xl"],
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
  },
  vipBadge: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
  features: {
    gap: Spacing.lg,
    marginBottom: Spacing["3xl"],
  },
  featureItem: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  featureContent: {
    flex: 1,
    justifyContent: "center",
  },
  featureTitle: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  priceCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  disclosureCard: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.lg,
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  priceHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: Spacing.sm,
  },
  price: {
    fontWeight: "700",
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  successTitle: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  successText: {
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: Spacing["2xl"],
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  legalLinks: {
    flexDirection: "row",
    justifyContent: "center",
  },
});
