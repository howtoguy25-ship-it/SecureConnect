import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { ordersStore } from '@/services/store';
import { StoreOrder } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

function OrderRow({ order }: { order: StoreOrder }) {
  const itemsSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemsText} numberOfLines={2}>
          {itemsSummary}
        </Text>
        <Text style={styles.buyerText}>{order.buyerName ?? order.buyerEmail ?? 'Buyer'} · {new Date(order.createdAt).toLocaleDateString()}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.netText}>${order.sellerNetUsd.toFixed(2)}</Text>
        <Text style={styles.feeText}>after ${order.platformFeeUsd.toFixed(2)} fee</Text>
      </View>
    </View>
  );
}

export default function OrdersScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<StoreOrder[]>([]);

  useEffect(() => {
    if (!user) return;
    return ordersStore.subscribe(user.uid, setOrders);
  }, [user]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Orders</Text>
        <View style={{ width: 26 }} />
      </View>

      {orders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
          <Text style={styles.emptyText}>No orders yet — they'll show up here the moment someone buys something from one of your published sites.</Text>
        </View>
      ) : (
        <FlatList data={orders} keyExtractor={(o) => o.id} renderItem={({ item }) => <OrderRow order={item} />} contentContainerStyle={{ paddingHorizontal: 16 }} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyText: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemsText: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  buyerText: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  netText: { fontSize: 15, fontWeight: '800', color: '#16A34A' },
  feeText: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
});
