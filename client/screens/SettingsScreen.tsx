import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Switch, Alert, ActivityIndicator, Platform, Linking, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import * as WebBrowser from "expo-web-browser";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { iapService } from "@/services/InAppPurchaseService";

interface AdminUser {
  id: string;
  phoneNumber: string;
  displayName: string;
  createdAt: string;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Real version from the installed binary (e.g. "1.0.5 (72)"). On web,
// nativeApplicationVersion is null, so fall back to the Expo config version.
const appVersionLabel = (() => {
  const version =
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    "1.0.0";
  const build = Application.nativeBuildVersion;
  return build ? `${version} (${build})` : version;
})();

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user, logout, refreshUser } = useAuth();
  const { notificationsEnabled, requestPermissions, disableNotifications } = useNotifications();

  const [readReceipts, setReadReceipts] = useState(true);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [isRemovingAds, setIsRemovingAds] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  // StoreKit-localized price for Remove Ads IAP. Null until loaded or when
  // unavailable (web/Expo Go) — fall back to a generic CTA so we never show
  // a hardcoded currency that contradicts the user's storefront price
  // (Apple Guideline 2.3.1 — Accurate Metadata).
  const [removeAdsPrice, setRemoveAdsPrice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const price = await iapService.getRemoveAdsLocalizedPrice();
      if (!cancelled) setRemoveAdsPrice(price);
    })();
    return () => { cancelled = true; };
  }, []);

  // Check owner status from server (secure - no client-side secrets)
  const { data: ownerCheck } = useQuery<{ isOwner: boolean }>({
    queryKey: ['/api/admin/check-owner'],
    enabled: !!user,
  });
  const isOwner = ownerCheck?.isOwner ?? false;

  const { data: reviewModeData } = useQuery<{ reviewMode: boolean }>({
    queryKey: ['/api/review-mode'],
    enabled: isOwner,
  });

  useEffect(() => {
    if (reviewModeData) {
      setReviewMode(reviewModeData.reviewMode);
    }
  }, [reviewModeData]);

  const handleToggleReviewMode = async (enabled: boolean) => {
    setReviewMode(enabled);
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/admin/review-mode', baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        setReviewMode(!enabled);
        Alert.alert('Error', 'Failed to update review mode');
      }
    } catch (error) {
      setReviewMode(!enabled);
      Alert.alert('Error', 'Failed to update review mode');
    }
  };

  // Owner-only query for all users (only fetches when owner and showUserList is true)
  const { data: allUsers, isLoading: isLoadingUsers, refetch: refetchUsers } = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
    enabled: isOwner && showUserList,
  });

  const openLegalPage = async (path: string, label: string) => {
    const url = new URL(path, getApiUrl()).toString();
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert('Error', `Unable to open ${label}`);
      }
    }
  };

  const openPrivacyPolicy = () => openLegalPage('/privacy', 'Privacy Policy');
  const openTermsOfService = () => openLegalPage('/terms', 'Terms of Service');
  const openSupport = () => navigation.navigate("Support");

  useEffect(() => {
    const fetchPendingRequests = async () => {
      try {
        const token = await getStoredToken();
        const baseUrl = getApiUrl();
        const response = await fetch(new URL('/api/message-requests/pending/count', baseUrl), {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setPendingRequestCount(data.count || 0);
        }
      } catch (error) {
        console.error('Error fetching pending requests:', error);
      }
    };
    fetchPendingRequests();
  }, []);

  const handleRemoveAds = async () => {
    if (isRemovingAds) return;
    setIsRemovingAds(true);

    // App Store Guideline 3.1.1: on iOS we MUST use Apple In-App Purchase only.
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        const { iapService } = await import('@/services/InAppPurchaseService');
        if (!iapService.isAvailable()) {
          Alert.alert(
            'Purchases Unavailable',
            'In-app purchases are not available on this device right now. Please update the app from the App Store and try again.'
          );
          return;
        }
        await iapService.purchaseRemoveAds(
          async () => {
            await refreshUser?.();
            Alert.alert('Success', 'Ads have been removed. Thank you for your purchase!');
          },
          (error: string) => {
            Alert.alert('Purchase Failed', error);
          }
        );
      } catch {
        Alert.alert('Error', 'Unable to start purchase. Please try again.');
      } finally {
        setIsRemovingAds(false);
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
    } catch (error: any) {
      Alert.alert('Error', 'Unable to start checkout. Please try again.');
    } finally {
      setIsRemovingAds(false);
    }
  };

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    const doDelete = async () => {
      setIsDeletingAccount(true);
      try {
        const token = await getStoredToken();
        const baseUrl = getApiUrl();
        const response = await fetch(new URL('/api/auth/account', baseUrl).toString(), {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to delete account');
        }
        await logout();
      } catch (error: any) {
        setIsDeletingAccount(false);
        if (Platform.OS === "web") {
          window.alert(error.message || 'Failed to delete account. Please try again.');
        } else {
          Alert.alert('Error', error.message || 'Failed to delete account. Please try again.');
        }
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("This will permanently erase your account, all messages, profile data, and phone number from Pryvo. This action cannot be undone.\n\nAre you absolutely sure?")) {
        await doDelete();
      }
    } else {
      Alert.alert(
        "Delete Account Permanently",
        "This will permanently erase your account, all messages, profile data, and phone number from Pryvo. This action cannot be undone.\n\nAre you absolutely sure?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, Delete Everything", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.section}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          NOTIFICATIONS
        </ThemedText>
        
        <Pressable
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={async () => {
            // Single source of truth: only the row's onPress drives the
            // toggle. The Switch below has pointerEvents="none" so it never
            // fires its own onValueChange (which previously caused the row
            // and switch to BOTH fire on one tap, flipping it on then off).
            //
            // Wrapped in try/catch because on iOS Safari (web) the
            // expo-notifications permission APIs can throw when the
            // browser doesn't support web push — without this guard the
            // row appeared completely unresponsive (the async error was
            // swallowed and no state ever changed). On web we also fall
            // back to flipping just the server-side preference so the
            // toggle still works as a "do you want push notifications when
            // you next use the native app" preference.
            try {
              const next = !notificationsEnabled;
              if (next) {
                if (Platform.OS === "web") {
                  // Best effort: attempt the real permission request, but
                  // if anything throws, still flip the server preference
                  // so the user gets visible feedback.
                  let granted = false;
                  try {
                    granted = await requestPermissions();
                  } catch (e) {
                    console.log("[Settings] requestPermissions threw on web:", e);
                  }
                  if (!granted) {
                    // requestPermissions only persists the preference when
                    // OS-level permission is granted. On web that almost
                    // never succeeds (Safari has no Web Push for installed
                    // PWAs in many configurations), so explicitly persist
                    // the user's intent here so the "Notifications saved"
                    // message is truthful and the toggle reflects state on
                    // their next sign-in from the native app.
                    try {
                      const tok = await getStoredToken();
                      if (tok) {
                        await fetch(new URL('/api/notifications/settings', getApiUrl()).toString(), {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${tok}`,
                          },
                          body: JSON.stringify({ enabled: true }),
                        });
                      }
                      await refreshUser?.();
                    } catch (err) {
                      console.log('[Settings] Failed to persist web notification preference:', err);
                    }
                    Alert.alert(
                      "Notifications saved",
                      "Push notifications can't be enabled in your browser. We've saved your preference — you'll get alerts on the Pryvo mobile app once you sign in there.",
                    );
                  }
                  return;
                }

                const granted = await requestPermissions();
                if (!granted) {
                  Alert.alert(
                    "Notifications Are Off",
                    "Pryvo needs notification permission to alert you about new messages, calls, and activity. Open Settings to allow notifications.",
                    [
                      { text: "Not Now", style: "cancel" },
                      {
                        text: "Open Settings",
                        onPress: () => {
                          if (Platform.OS !== "web") {
                            Linking.openSettings().catch(() => {});
                          }
                        },
                      },
                    ],
                  );
                }
              } else {
                await disableNotifications();
              }
            } catch (e) {
              console.log("[Settings] Notification toggle failed:", e);
              if (Platform.OS === "web") {
                window.alert("Couldn't update notification settings. Please try again.");
              } else {
                Alert.alert("Error", "Couldn't update notification settings. Please try again.");
              }
            }
          }}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#FF3B30" }]}>
              <Feather name="bell" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText type="body">Push Notifications</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={2}>
                Get alerts for new messages, calls, and activity
              </ThemedText>
            </View>
          </View>
          {/* Switch sized down slightly on iOS so it never overflows the row
              on small phones (5.4" / SE). pointerEvents="none" lets the parent
              Pressable own the toggle so we don't get the on→off double-fire. */}
          <View pointerEvents="none" style={styles.switchSlot}>
            <Switch
              value={notificationsEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
              ios_backgroundColor={theme.border}
              style={Platform.OS === "ios" ? { transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] } : undefined}
            />
          </View>
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          SOUNDS
        </ThemedText>

        <Pressable
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("Ringtone")}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#FF9500" }]}>
              <Feather name="music" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">Ringtone</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Choose your incoming call sound
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          SECURITY
        </ThemedText>

        <Pressable
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("Security")}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: theme.primary }]}>
              <Feather name="shield" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">Security</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Encryption, recovery code, trusted devices
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          PRIVACY
        </ThemedText>
        
        <View style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.settingInfo}>
            <Feather name="check-circle" size={20} color={theme.text} />
            <ThemedText type="body">Read Receipts</ThemedText>
          </View>
          <Switch
            value={readReceipts}
            onValueChange={setReadReceipts}
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>

        <Pressable
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("PeekDetectionSettings" as never)}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#5856D6" }]}>
              <Feather name="eye-off" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">Peek Detection</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Hide chats when someone looks over your shoulder
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("BlockedContacts")}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#FF3B30" }]}>
              <Feather name="slash" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">Blocked Contacts</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Manage blocked users
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
        
        <Pressable 
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("MessageRequests")}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#5856D6" }]}>
              <Feather name="mail" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">Message Requests</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Control who can message you
              </ThemedText>
            </View>
          </View>
          <View style={styles.badgeRow}>
            {pendingRequestCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: theme.error }]}>
                <ThemedText type="small" style={{ color: "#fff", fontWeight: "600" }}>
                  {pendingRequestCount}
                </ThemedText>
              </View>
            ) : null}
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
        </Pressable>

        <Pressable 
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("LastSeenPrivacy")}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#34C759" }]}>
              <Feather name="clock" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">Last Seen Privacy</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Control who sees when you were online
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("PrivacySettings" as never)}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#5856D6" }]}>
              <Feather name="eye-off" size={16} color="#fff" />
            </View>
            <View style={styles.settingTextColumn}>
              <ThemedText type="body" numberOfLines={1}>Privacy & Messaging</ThemedText>
              <ThemedText type="small" numberOfLines={2} style={{ color: theme.textSecondary }}>
                Read receipts, typing, notification preview, disappearing
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} style={styles.chevron} />
        </Pressable>

        <Pressable
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("StorySettings" as never)}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#FF9500" }]}>
              <Feather name="aperture" size={16} color="#fff" />
            </View>
            <View style={styles.settingTextColumn}>
              <ThemedText type="body" numberOfLines={1}>Stories</ThemedText>
              <ThemedText type="small" numberOfLines={2} style={{ color: theme.textSecondary }}>
                Choose who sees your story, view receipts, turn off
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} style={styles.chevron} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          ACCOUNT
        </ThemedText>
        
        <View style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.settingInfo}>
            <Feather name="phone" size={20} color={theme.text} />
            <View>
              <ThemedText type="body">Phone Number</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {user?.phoneNumber}
              </ThemedText>
            </View>
          </View>
        </View>
        
        <Pressable 
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => navigation.navigate("QRCode")}
        >
          <View style={styles.settingInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#2563EB" }]}>
              <Feather name="grid" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">My QR Code</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Share your code to connect with friends
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
        
        {user?.isVip ? (
          <Pressable
            style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => navigation.navigate("VipUpgrade")}
          >
            <View style={styles.settingInfo}>
              <Feather name="award" size={20} color={theme.accent} />
              <View>
                <ThemedText type="body" style={{ color: theme.accent }}>
                  VIP Membership
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Active subscription
                </ThemedText>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        ) : null}
        
        {!user?.isVip && !user?.isAdFree ? (
          <Pressable 
            style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={handleRemoveAds}
            disabled={isRemovingAds}
          >
            <View style={styles.settingInfo}>
              <Feather name="x-circle" size={20} color={theme.primary} />
              <View>
                <ThemedText type="body">Remove Ads</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {removeAdsPrice
                    ? `One-time purchase - ${removeAdsPrice}`
                    : 'One-time purchase'}
                </ThemedText>
              </View>
            </View>
            {isRemovingAds ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            )}
          </Pressable>
        ) : null}
        
        {user?.isAdFree && !user?.isVip ? (
          <View style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.settingInfo}>
              <Feather name="check-circle" size={20} color="#34C759" />
              <View>
                <ThemedText type="body">Ad-Free</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Ads permanently removed
                </ThemedText>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {isOwner ? (
        <View style={styles.section}>
          <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            OWNER CONTROLS
          </ThemedText>
          
          <Pressable 
            style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => {
              setShowUserList(!showUserList);
              if (!showUserList) {
                refetchUsers();
              }
            }}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.iconBg, { backgroundColor: "#FF9500" }]}>
                <Feather name="users" size={16} color="#fff" />
              </View>
              <View>
                <ThemedText type="body">Registered Users</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  View all signed up users
                </ThemedText>
              </View>
            </View>
            <Feather 
              name={showUserList ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={theme.textSecondary} 
            />
          </Pressable>

          <Pressable
            style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => navigation.navigate("AdminReports" as never)}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.iconBg, { backgroundColor: "#FF3B30" }]}>
                <Feather name="flag" size={16} color="#fff" />
              </View>
              <View>
                <ThemedText type="body">Moderation Queue</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Review user reports and take action
                </ThemedText>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          
          {/* Same Pressable-driven pattern as the Push Notifications row.
              On iOS Safari (web), Switch.onValueChange does NOT fire reliably
              when tapped — the touch is consumed by the Switch but no event
              propagates, so the toggle visually appears stuck. Wrapping the
              row in a Pressable + pointerEvents="none" Switch makes the
              entire row a tap target and lets the parent drive the state. */}
          <Pressable
            style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => handleToggleReviewMode(!reviewMode)}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.iconBg, { backgroundColor: reviewMode ? "#34C759" : "#8E8E93" }]}>
                <Feather name="eye" size={16} color="#fff" />
              </View>
              <View>
                <ThemedText type="body">App Store Review Mode</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {reviewMode ? "Demo login visible to reviewers" : "Demo login hidden from users"}
                </ThemedText>
              </View>
            </View>
            <View pointerEvents="none">
              <Switch
                value={reviewMode}
                trackColor={{ false: '#767577', true: '#34C759' }}
              />
            </View>
          </Pressable>

          {showUserList ? (
            <View style={[styles.userListContainer, { backgroundColor: theme.backgroundDefault }]}>
              {isLoadingUsers ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
                    Loading users...
                  </ThemedText>
                </View>
              ) : allUsers && allUsers.length > 0 ? (
                <>
                  <ThemedText type="small" style={[styles.userCount, { color: theme.textSecondary }]}>
                    Total: {allUsers.length} users
                  </ThemedText>
                  {allUsers.map((adminUser) => (
                    <View key={adminUser.id} style={[styles.userItem, { borderBottomColor: theme.border }]}>
                      <View style={styles.userInfo}>
                        <ThemedText type="body" style={{ fontWeight: "500" }}>
                          {adminUser.displayName}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                          {adminUser.phoneNumber}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {adminUser.createdAt ? new Date(adminUser.createdAt).toLocaleDateString() : 'N/A'}
                      </ThemedText>
                    </View>
                  ))}
                </>
              ) : (
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", padding: Spacing.lg }}>
                  No users found
                </ThemedText>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {user?.isVip ? (
        <View style={styles.section}>
          <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            SECURECONNECT NUMBER
          </ThemedText>
          
          <Pressable 
            style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => navigation.navigate("VirtualNumber")}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.iconBg, { backgroundColor: theme.primary }]}>
                <Feather name="phone" size={16} color="#fff" />
              </View>
              <View>
                <ThemedText type="body">App Phone Number</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Get a dedicated encrypted number
                </ThemedText>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          ABOUT
        </ThemedText>
        
        <View style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.settingInfo}>
            <Feather name="info" size={20} color={theme.text} />
            <View>
              <ThemedText type="body">Version</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {appVersionLabel}
              </ThemedText>
            </View>
          </View>
        </View>
        
        <Pressable 
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={openTermsOfService}
        >
          <View style={styles.settingInfo}>
            <Feather name="file-text" size={20} color={theme.text} />
            <ThemedText type="body">Terms of Service</ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
        
        <Pressable 
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={openPrivacyPolicy}
        >
          <View style={styles.settingInfo}>
            <Feather name="lock" size={20} color={theme.text} />
            <ThemedText type="body">Privacy Policy</ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
        
        <Pressable 
          style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }]}
          onPress={openSupport}
        >
          <View style={styles.settingInfo}>
            <Feather name="help-circle" size={20} color={theme.text} />
            <ThemedText type="body">Support</ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <Pressable
        style={[styles.dangerButton, { borderColor: theme.error, opacity: isDeletingAccount ? 0.5 : 1 }]}
        onPress={handleDeleteAccount}
        disabled={isDeletingAccount}
      >
        {isDeletingAccount ? (
          <ActivityIndicator size="small" color={theme.error} />
        ) : (
          <Feather name="trash-2" size={20} color={theme.error} />
        )}
        <ThemedText type="body" style={{ color: theme.error }}>
          {isDeletingAccount ? "Deleting Account..." : "Delete Account"}
        </ThemedText>
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
    fontWeight: "600",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    minHeight: 56,
  },
  settingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
    minWidth: 0,
  },
  settingTextColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: Spacing.sm,
  },
  chevron: {
    flexShrink: 0,
    marginLeft: Spacing.xs,
  },
  switchSlot: {
    marginLeft: Spacing.sm,
    minWidth: 52,
    alignItems: "flex-end",
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.xl,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    minWidth: 24,
    alignItems: "center",
  },
  userListContainer: {
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
    padding: Spacing.md,
    maxHeight: 400,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  userCount: {
    marginBottom: Spacing.md,
    fontWeight: "600",
  },
  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
  },
  userInfo: {
    flex: 1,
  },
});
