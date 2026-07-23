import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { discountCodesStore, createDiscountCode, setDiscountCodeActive, deleteDiscountCode } from '@/services/store';
import { DiscountCode, DiscountType } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DiscountCodes'>;

function summaryFor(code: DiscountCode): string {
  return code.type === 'percent' ? `${code.amount}% off` : `$${code.amount.toFixed(2)} off`;
}

function CodeRow({ code, onToggle, onDelete, busy }: { code: DiscountCode; onToggle: () => void; onDelete: () => void; busy: boolean }) {
  const expired = code.expiresAt != null && code.expiresAt < Date.now();
  const usedUp = code.maxRedemptions != null && code.redemptionCount >= code.maxRedemptions;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.codeText}>{code.code}</Text>
        <Text style={styles.summaryText}>{summaryFor(code)}</Text>
        <Text style={styles.metaText}>
          {code.redemptionCount} used{code.maxRedemptions != null ? ` / ${code.maxRedemptions}` : ''}
          {code.expiresAt != null ? ` · expires ${new Date(code.expiresAt).toLocaleDateString()}` : ''}
          {expired ? ' · expired' : usedUp ? ' · fully redeemed' : ''}
        </Text>
      </View>
      <Pressable style={styles.iconBtn} onPress={onToggle} disabled={busy} hitSlop={8}>
        <Ionicons name={code.active ? 'checkmark-circle' : 'close-circle'} size={22} color={code.active ? '#16A34A' : '#94A3B8'} />
      </Pressable>
      <Pressable style={styles.iconBtn} onPress={onDelete} disabled={busy} hitSlop={8}>
        <Ionicons name="trash-outline" size={20} color="#DC2626" />
      </Pressable>
    </View>
  );
}

export default function DiscountCodesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [codeInput, setCodeInput] = useState('');
  const [type, setType] = useState<DiscountType>('percent');
  const [amount, setAmount] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');

  useEffect(() => {
    if (!user) return;
    return discountCodesStore.subscribe(user.uid, setCodes);
  }, [user]);

  const handleCreate = async () => {
    const amountValue = parseFloat(amount);
    if (!codeInput.trim()) {
      showAlert('Missing code', 'Enter a code, e.g. SUMMER20.');
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showAlert('Invalid amount', type === 'percent' ? 'Enter a percent between 1 and 100.' : 'Enter an amount greater than 0.');
      return;
    }
    setCreating(true);
    try {
      const maxRedemptionsValue = maxRedemptions.trim() ? parseInt(maxRedemptions, 10) : null;
      const expiresInDaysValue = expiresInDays.trim() ? parseInt(expiresInDays, 10) : null;
      await createDiscountCode({
        code: codeInput,
        type,
        amount: amountValue,
        maxRedemptions: maxRedemptionsValue != null && Number.isFinite(maxRedemptionsValue) ? maxRedemptionsValue : null,
        expiresAt: expiresInDaysValue != null && Number.isFinite(expiresInDaysValue) ? Date.now() + expiresInDaysValue * 86400000 : null,
      });
      setCodeInput('');
      setAmount('');
      setMaxRedemptions('');
      setExpiresInDays('');
    } catch (err: any) {
      showAlert('Could not create code', err?.message ?? 'Try again in a moment.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (code: DiscountCode) => {
    setBusyCode(code.code);
    try {
      await setDiscountCodeActive(code.code, !code.active);
    } catch (err: any) {
      showAlert('Could not update code', err?.message ?? 'Try again in a moment.');
    } finally {
      setBusyCode(null);
    }
  };

  const handleDelete = (code: DiscountCode) => {
    showAlert('Delete this code?', `Buyers will no longer be able to use ${code.code}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyCode(code.code);
          try {
            await deleteDiscountCode(code.code);
          } catch (err: any) {
            showAlert('Could not delete code', err?.message ?? 'Try again in a moment.');
          } finally {
            setBusyCode(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Discount Codes</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={codes}
        keyExtractor={(c) => c.code}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={styles.createCard}>
            <Text style={styles.createTitle}>New code</Text>
            <TextInput
              style={styles.input}
              value={codeInput}
              onChangeText={(t) => setCodeInput(t.toUpperCase())}
              placeholder="e.g. SUMMER20"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
            />
            <View style={styles.rowButtons}>
              <Pressable style={[styles.toggleBtn, type === 'percent' && styles.toggleBtnActive]} onPress={() => setType('percent')}>
                <Text style={[styles.toggleBtnText, type === 'percent' && styles.toggleBtnTextActive]}>% Percent off</Text>
              </Pressable>
              <Pressable style={[styles.toggleBtn, type === 'fixed' && styles.toggleBtnActive]} onPress={() => setType('fixed')}>
                <Text style={[styles.toggleBtnText, type === 'fixed' && styles.toggleBtnTextActive]}>$ Fixed amount off</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder={type === 'percent' ? 'e.g. 20 (for 20%)' : 'e.g. 5.00'}
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.input}
              value={maxRedemptions}
              onChangeText={setMaxRedemptions}
              placeholder="Max uses (optional, blank = unlimited)"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
            />
            <TextInput
              style={styles.input}
              value={expiresInDays}
              onChangeText={setExpiresInDays}
              placeholder="Expires in days (optional, blank = never)"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
            />
            {creating ? (
              <ActivityIndicator style={{ marginTop: 10 }} />
            ) : (
              <Pressable style={styles.createBtn} onPress={handleCreate}>
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.createBtnText}>Create Code</Text>
              </Pressable>
            )}
            <Text style={styles.helperText}>Works across all of your published stores — buyers enter it at checkout.</Text>
            {codes.length > 0 && <Text style={[styles.createTitle, { marginTop: 16 }]}>Your codes</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <CodeRow code={item} onToggle={() => handleToggle(item)} onDelete={() => handleDelete(item)} busy={busyCode === item.code} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pricetags-outline" size={36} color="#CBD5E1" />
            <Text style={styles.emptyText}>No discount codes yet — create one above.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  createCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12 },
  createTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 10,
    color: '#0F172A',
  },
  rowButtons: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  toggleBtn: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#111827', borderColor: '#111827' },
  toggleBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  toggleBtnTextActive: { color: '#FFFFFF' },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4338CA',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  createBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  helperText: { fontSize: 11, color: '#94A3B8', marginTop: 8, lineHeight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  codeText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  summaryText: { fontSize: 13, color: '#4338CA', fontWeight: '700', marginTop: 2 },
  metaText: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  iconBtn: { padding: 2 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
