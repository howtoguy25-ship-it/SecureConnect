import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import { APP_THEMES, APP_THEME_ORDER } from '@/theme/appThemes';
import { userAccountStore } from '@/storage/userAccountStore';
import { UserAccount } from '@/types';
import { getPlan } from '@/data/pricing';
import { restorePurchases } from '@/services/iap';
import { sendTestPushNotification } from '@/services/pushNotifications';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

export default function AccountScreen({ navigation }: Props) {
  const { user, signOut, deleteAccount } = useAuth();
  const { theme, themeId, setThemeId } = useAppTheme();
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingTestPush, setSendingTestPush] = useState(false);

  useEffect(() => {
    if (!user) return;
    return userAccountStore.subscribe(user.uid, setAccount);
  }, [user]);

  const identity = user?.email || user?.phoneNumber || 'Signed in';
  const planName = account ? (getPlan(account.plan)?.name ?? 'Free') : null;

  const confirmSignOut = () => {
    showAlert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleRestore = async () => {
    if (Platform.OS === 'web') {
      showAlert(
        'Nothing to restore',
        "Your credits and plan are already live on your account the moment you sign in -- there's no separate restore step on web. Use Subscription -> Manage billing to update or cancel a web subscription."
      );
      return;
    }
    setRestoring(true);
    try {
      const count = await restorePurchases();
      showAlert(
        count > 0 ? 'Purchases restored' : 'Nothing to restore',
        count > 0
          ? `${count} purchase${count === 1 ? '' : 's'} restored to this account.`
          : 'No previous purchases were found for this Apple ID.'
      );
    } catch (err: any) {
      showAlert('Could not restore purchases', err?.message ?? 'Try again in a moment.');
    } finally {
      setRestoring(false);
    }
  };

  const handleSendTestPush = async () => {
    setSendingTestPush(true);
    try {
      const tokenCount = await sendTestPushNotification();
      showAlert(
        'Test notification sent',
        `Sent to ${tokenCount} registered device${tokenCount === 1 ? '' : 's'} -- it should arrive within a few seconds. If nothing shows up, check that notifications are allowed for this app in your device Settings.`
      );
    } catch (err: any) {
      showAlert('Could not send test notification', err?.message ?? 'Try again in a moment.');
    } finally {
      setSendingTestPush(false);
    }
  };

  const confirmDeleteAccount = () => {
    showAlert(
      'Delete account?',
      'This permanently deletes your account, projects, published sites, and order history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            showAlert('Are you sure?', 'Type nothing, just confirm one more time — this is permanent.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes, Delete Everything',
                style: 'destructive',
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await deleteAccount();
                  } catch (err: any) {
                    setDeleting(false);
                    showAlert('Could not delete account', err?.message ?? 'Try again in a moment.');
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Account</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
          <Ionicons name="person" size={28} color={theme.accentText} />
        </View>
        <Text style={[styles.identity, { color: theme.text }]}>{identity}</Text>
      </View>

      <View style={styles.creditsCard}>
        <View>
          <Text style={styles.creditsValue}>{account?.credits ?? '—'}</Text>
          <Text style={styles.creditsLabel}>credits · {planName ?? 'Free'} plan</Text>
        </View>
        <Pressable style={styles.buyMoreButton} onPress={() => navigation.navigate('Subscription')}>
          <Text style={styles.buyMoreText}>Buy More</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Appearance</Text>
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <View style={styles.themeRow}>
          {APP_THEME_ORDER.map((id) => {
            const t = APP_THEMES[id];
            const active = id === themeId;
            return (
              <Pressable key={id} style={styles.themeSwatchWrap} onPress={() => setThemeId(id)}>
                <View
                  style={[
                    styles.themeSwatch,
                    { backgroundColor: t.background, borderColor: active ? t.accent : theme.border },
                    active && styles.themeSwatchActive,
                  ]}
                >
                  <Text style={[styles.themeSwatchLetter, { color: t.text }]}>Aa</Text>
                  {active && <Ionicons name="checkmark-circle" size={16} color={t.accent} style={styles.themeCheck} />}
                </View>
                <Text style={[styles.themeSwatchName, { color: theme.textMuted }, active && { color: theme.text, fontWeight: '700' }]}>
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.surface, marginTop: 16 }]}>
        <Pressable style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => navigation.navigate('SellerAccount')}>
          <Ionicons name="storefront-outline" size={20} color={theme.textMuted} />
          <Text style={[styles.rowText, { color: theme.text }]}>My Store & Payouts</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
        <Pressable style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => navigation.navigate('Orders')}>
          <Ionicons name="receipt-outline" size={20} color={theme.textMuted} />
          <Text style={[styles.rowText, { color: theme.text }]}>Orders</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
        <Pressable style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => navigation.navigate('Support')}>
          <Ionicons name="help-circle-outline" size={20} color={theme.textMuted} />
          <Text style={[styles.rowText, { color: theme.text }]}>Support</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
        <Pressable style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => navigation.navigate('Policy', { policyType: 'privacy' })}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.textMuted} />
          <Text style={[styles.rowText, { color: theme.text }]}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
        <Pressable style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => navigation.navigate('Policy', { policyType: 'returns' })}>
          <Ionicons name="receipt-outline" size={20} color={theme.textMuted} />
          <Text style={[styles.rowText, { color: theme.text }]}>Return & Refund Policy</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
        <Pressable style={[styles.row, { borderBottomColor: theme.border }]} onPress={handleRestore} disabled={restoring}>
          <Ionicons name="refresh-outline" size={20} color={theme.textMuted} />
          <Text style={[styles.rowText, { color: theme.text }]}>Restore Purchases</Text>
          {restoring ? <ActivityIndicator size="small" /> : <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
        </Pressable>
        <Pressable style={[styles.row, { borderBottomColor: theme.border }]} onPress={handleSendTestPush} disabled={sendingTestPush}>
          <Ionicons name="notifications-outline" size={20} color={theme.textMuted} />
          <Text style={[styles.rowText, { color: theme.text }]}>Send Test Notification</Text>
          {sendingTestPush ? <ActivityIndicator size="small" /> : <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
        </Pressable>
      </View>

      <Pressable style={styles.signOutButton} onPress={confirmSignOut}>
        <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={confirmDeleteAccount} disabled={deleting}>
        {deleting ? (
          <ActivityIndicator size="small" color="#94A3B8" />
        ) : (
          <>
            <Ionicons name="trash-outline" size={16} color="#94A3B8" />
            <Text style={styles.deleteText}>Delete Account</Text>
          </>
        )}
      </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  profileCard: { alignItems: 'center', paddingVertical: 30 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  identity: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  creditsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2FF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    padding: 16,
  },
  creditsValue: { fontSize: 26, fontWeight: '800', color: '#4338CA' },
  creditsLabel: { fontSize: 12, color: '#6366F1', marginTop: 2, fontWeight: '600' },
  buyMoreButton: { backgroundColor: '#4338CA', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buyMoreText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '700', marginHorizontal: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { backgroundColor: '#FFFFFF', marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  themeRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, paddingHorizontal: 8 },
  themeSwatchWrap: { alignItems: 'center', gap: 6 },
  themeSwatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeSwatchActive: { borderWidth: 3 },
  themeSwatchLetter: { fontSize: 15, fontWeight: '700' },
  themeCheck: { position: 'absolute', bottom: -4, right: -4 },
  themeSwatchName: { fontSize: 11, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  rowText: { fontSize: 14, fontWeight: '600', color: '#0F172A', flex: 1 },
  rowValue: { fontSize: 13, color: '#64748B' },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingVertical: 14,
  },
  signOutText: { color: '#DC2626', fontWeight: '700' },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: 24,
    paddingVertical: 10,
  },
  deleteText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});
