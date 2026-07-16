import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { env } from '@/config/env';
import { userAccountStore } from '@/storage/userAccountStore';
import { UserAccount } from '@/types';
import { getPlan } from '@/data/pricing';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

export default function AccountScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const [account, setAccount] = useState<UserAccount | null>(null);

  useEffect(() => {
    if (!user) return;
    return userAccountStore.subscribe(user.uid, setAccount);
  }, [user]);

  const identity = user?.email || user?.phoneNumber || 'Signed in';
  const planName = account ? (getPlan(account.plan)?.name ?? 'Free') : null;

  const confirmSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
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
        <Pressable style={styles.row} onPress={() => Linking.openURL(`mailto:${env.supportEmail}`)}>
          <Ionicons name="help-circle-outline" size={20} color="#334155" />
          <Text style={styles.rowText}>Support</Text>
          <Text style={styles.rowValue}>{env.supportEmail}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => Linking.openURL(`tel:${env.supportPhone.replace(/\s/g, '')}`)}>
          <Ionicons name="call-outline" size={20} color="#334155" />
          <Text style={styles.rowText}>Contact</Text>
          <Text style={styles.rowValue}>{env.supportPhone}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.signOutButton} onPress={confirmSignOut}>
        <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        <Text style={styles.signOutText}>Sign Out</Text>
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
});
