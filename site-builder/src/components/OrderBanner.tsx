import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { userAccountStore } from '@/storage/userAccountStore';
import { OrderNotice } from '@/types';
import { navigateTo } from '@/navigation/navigationRef';

// Rendered as a sibling of the main Stack.Navigator (same pattern as BillingBanner/
// AssistantLauncher). Subscribes to the account doc's lastOrderNotice field -- only ever
// set by the Stripe webhook (see handleStoreOrderCompleted in index.ts) -- so a seller
// sees a real-time "you got a new order" the moment it happens with the app open, on top
// of the real email that goes out regardless (see emailApi.ts). Anchored near the bottom
// (above the assistant FAB) rather than the top, so it never fights BillingBanner for the
// same slot if both happen to be showing at once.
export default function OrderBanner() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [notice, setNotice] = useState<OrderNotice | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setNotice(null);
      return;
    }
    return userAccountStore.subscribe(user.uid, (account) => {
      setNotice(account?.lastOrderNotice ?? null);
    });
  }, [user]);

  if (!notice || notice.orderId === dismissedId) {
    return null;
  }

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 92 }]} pointerEvents="box-none">
      <Pressable style={styles.banner} onPress={() => navigateTo('Orders')}>
        <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.text}>{notice.message}</Text>
        <Pressable hitSlop={8} onPress={() => setDismissedId(notice.orderId)}>
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
    zIndex: 99,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#15803D',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
