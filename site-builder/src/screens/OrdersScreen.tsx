import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { ordersStore, updateOrderFulfillment } from '@/services/store';
import { StoreOrder, FulfillmentStatus } from '@/types';
import { currencySymbol } from '@/utils/currency';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

const STATUS_LABEL: Record<FulfillmentStatus, string> = {
  unfulfilled: 'Unfulfilled',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<FulfillmentStatus, string> = {
  unfulfilled: '#94A3B8',
  shipped: '#2563EB',
  delivered: '#16A34A',
  cancelled: '#DC2626',
};

function OrderRow({ order }: { order: StoreOrder }) {
  // Each order records the real currency it was actually charged in at checkout time (see
  // handleStoreOrderCompleted) -- always show that order's own currency, never the seller's
  // *current* setting, since a seller who changes currency later shouldn't have old orders
  // silently relabeled into a currency they were never actually paid in.
  const sym = currencySymbol(order.currency);
  const itemsSummary = order.items.map((i) => `${i.quantity}× ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''}`).join(', ');
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<FulfillmentStatus>(order.fulfillmentStatus);
  const [carrier, setCarrier] = useState(order.trackingCarrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateOrderFulfillment({ orderId: order.id, fulfillmentStatus: status, trackingCarrier: carrier, trackingNumber });
      if (status === 'shipped' && order.buyerEmail) {
        showAlert('Saved', "The buyer's been emailed that their order shipped.");
      }
    } catch (err: any) {
      showAlert('Could not update order', err?.message ?? 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.row}>
      <Pressable style={styles.rowTop} onPress={() => setExpanded((v) => !v)}>
        <View style={{ flex: 1 }}>
          {order.bookingDetails && (
            <Text style={styles.bookingBadge}>
              📅 {order.bookingDetails.preferredDate} at {order.bookingDetails.preferredTime}
            </Text>
          )}
          <Text style={styles.itemsText} numberOfLines={2}>
            {itemsSummary}
          </Text>
          {order.bookingDetails?.notes ? (
            <Text style={styles.notesText} numberOfLines={2}>
              Note: {order.bookingDetails.notes}
            </Text>
          ) : null}
          <Text style={styles.buyerText}>{order.buyerName ?? order.buyerEmail ?? 'Buyer'} · {new Date(order.createdAt).toLocaleDateString()}</Text>
          <Text style={[styles.statusText, { color: STATUS_COLOR[order.fulfillmentStatus] }]}>{STATUS_LABEL[order.fulfillmentStatus]}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.netText}>{sym}{order.sellerNetUsd.toFixed(2)}</Text>
          <Text style={styles.feeText}>after {sym}{order.platformFeeUsd.toFixed(2)} fee</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" style={{ marginTop: 6 }} />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.fulfillmentSection}>
          <Text style={styles.fieldLabel}>Fulfillment status</Text>
          <View style={styles.statusRow}>
            {(Object.keys(STATUS_LABEL) as FulfillmentStatus[]).map((s) => (
              <Pressable key={s} style={[styles.statusChip, status === s && { backgroundColor: STATUS_COLOR[s] }]} onPress={() => setStatus(s)}>
                <Text style={[styles.statusChipText, status === s && { color: '#FFFFFF' }]}>{STATUS_LABEL[s]}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Carrier (optional)</Text>
          <TextInput style={styles.input} value={carrier} onChangeText={setCarrier} placeholder="e.g. USPS, UPS, FedEx" placeholderTextColor="#94A3B8" />
          <Text style={styles.fieldLabel}>Tracking number (optional)</Text>
          <TextInput style={styles.input} value={trackingNumber} onChangeText={setTrackingNumber} placeholder="e.g. 1Z999AA10123456784" placeholderTextColor="#94A3B8" />
          {saving ? (
            <ActivityIndicator style={{ marginTop: 8 }} />
          ) : (
            <Pressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          )}
        </View>
      )}
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  itemsText: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  buyerText: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  statusText: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  bookingBadge: { fontSize: 11, fontWeight: '700', color: '#4338CA', marginBottom: 2 },
  notesText: { fontSize: 12, color: '#64748B', fontStyle: 'italic', marginTop: 2 },
  netText: { fontSize: 15, fontWeight: '800', color: '#16A34A' },
  feeText: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  fulfillmentSection: { borderTopWidth: 1, borderTopColor: '#F1F5F9', padding: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 4 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  statusChip: { backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statusChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 6,
    color: '#0F172A',
  },
  saveBtn: { backgroundColor: '#111827', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 6 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
