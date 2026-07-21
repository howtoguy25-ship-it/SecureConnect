import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { userAccountStore } from '@/storage/userAccountStore';
import { UserAccount } from '@/types';
import { getPlan } from '@/data/pricing';
import { restorePurchases } from '@/services/iap';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

export default function AccountScreen({ navigation }: Props) {
  const { user, signOut, deleteAccount } = useAuth();
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Account</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.identity}>{identity}</Text>
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

      <View style={styles.section}>
        <Pressable style={styles.row} onPress={() => navigation.navigate('SellerAccount')}>
          <Ionicons name="storefront-outline" size={20} color="#334155" />
          <Text style={styles.rowText}>My Store & Payouts</Text>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Orders')}>
          <Ionicons name="receipt-outline" size={20} color="#334155" />
          <Text style={styles.rowText}>Orders</Text>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Support')}>
          <Ionicons name="help-circle-outline" size={20} color="#334155" />
          <Text style={styles.rowText}>Support</Text>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Policy', { policyType: 'privacy' })}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#334155" />
          <Text style={styles.rowText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Policy', { policyType: 'returns' })}>
          <Ionicons name="receipt-outline" size={20} color="#334155" />
          <Text style={styles.rowText}>Return & Refund Policy</Text>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </Pressable>
        <Pressable style={styles.row} onPress={handleRestore} disabled={restoring}>
          <Ionicons name="refresh-outline" size={20} color="#334155" />
          <Text style={styles.rowText}>Restore Purchases</Text>
          {restoring ? <ActivityIndicator size="small" /> : <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
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
  section: { backgroundColor: '#FFFFFF', marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
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
