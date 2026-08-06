import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { userAccountStore } from '@/storage/userAccountStore';
import { BillingNotice } from '@/types';
import { navigateTo } from '@/navigation/navigationRef';

// Rendered as a sibling of the main Stack.Navigator (same pattern as AssistantLauncher) so it
// floats above every signed-in screen. Subscribes to the account doc's billingNotice field --
// only ever set by Cloud Functions (appStoreServerNotifications / enforceBillingSuspensions in
// index.ts), never written by the client -- to warn a user their site is about to go down, or
// that it already has, without them needing to open the Subscription screen to find out.
export default function BillingBanner() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [notice, setNotice] = useState<BillingNotice | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setNotice(null);
      return;
    }
    return userAccountStore.subscribe(user.uid, (account) => {
      setNotice(account?.billingNotice ?? null);
    });
  }, [user]);

  if (!notice || notice.type === 'resolved' || notice.createdAt === dismissedAt) {
    return null;
  }

  const isSuspended = notice.type === 'suspended';

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        style={[styles.banner, isSuspended ? styles.bannerSuspended : styles.bannerWarning]}
        onPress={() => navigateTo('Subscription')}
      >
        <Ionicons name={isSuspended ? 'alert-circle' : 'warning'} size={20} color="#FFFFFF" />
        <Text style={styles.text}>{notice.message}</Text>
        <Pressable hitSlop={8} onPress={() => setDismissedAt(notice.createdAt)}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 100,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bannerWarning: {
    backgroundColor: '#B45309',
  },
  bannerSuspended: {
    backgroundColor: '#B91C1C',
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
