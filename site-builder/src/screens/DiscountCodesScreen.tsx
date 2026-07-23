import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { discountCodesStore, createDiscountCode, setDiscountCodeActive, setDiscountCodeAnnouncement, deleteDiscountCode, sellerAccountStore } from '@/services/store';
import { DiscountCode, DiscountKind, DiscountType } from '@/types';
import { currencySymbol } from '@/utils/currency';

type Props = NativeStackScreenProps<RootStackParamList, 'DiscountCodes'>;

const KIND_OPTIONS: { kind: DiscountKind; label: string }[] = [
  { kind: 'order', label: 'Whole order' },
  { kind: 'item', label: 'One product' },
  { kind: 'bogo', label: 'Buy X Get Y' },
  { kind: 'shipping', label: 'Shipping' },
];

// "How long to display" the on-site announcement banner -- see renderDiscountAnnouncementScript
// in siteHtml.ts for why short presets act as a per-visit auto-fade animation while the
// longer ones just keep the banner available (no auto-timer) until the seller turns it off.
const DURATION_PRESETS: { label: string; ms: number }[] = [
  { label: '5 sec', ms: 5 * 1000 },
  { label: '1 min', ms: 60 * 1000 },
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '1 month', ms: 30 * 24 * 60 * 60 * 1000 },
];

function summaryFor(code: DiscountCode, sym: string): string {
  const kind = code.kind ?? 'order';
  if (kind === 'bogo') return `Buy ${code.bogoBuyQuantity} ${code.targetProductName}, get ${code.bogoGetQuantity} free`;
  const amountText = code.type === 'percent' ? `${code.amount}% off` : `${sym}${code.amount.toFixed(2)} off`;
  if (kind === 'item') return `${amountText} ${code.targetProductName}`;
  if (kind === 'shipping') return `${amountText} shipping`;
  return amountText;
}

function CodeRow({
  code,
  currencySym,
  onToggle,
  onDelete,
  onAnnounce,
  busy,
}: {
  code: DiscountCode;
  currencySym: string;
  onToggle: () => void;
  onDelete: () => void;
  onAnnounce: (durationMs: number | null) => void;
  busy: boolean;
}) {
  const [pickingDuration, setPickingDuration] = useState(false);
  const expired = code.expiresAt != null && code.expiresAt < Date.now();
  const notYetStarted = code.startsAt != null && code.startsAt > Date.now();
  const usedUp = code.maxRedemptions != null && code.redemptionCount >= code.maxRedemptions;

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.codeText}>{code.code}</Text>
          <Text style={styles.summaryText}>{summaryFor(code, currencySym)}</Text>
          <Text style={styles.metaText}>
            {code.redemptionCount} used{code.maxRedemptions != null ? ` / ${code.maxRedemptions}` : ''}
            {code.startsAt != null ? ` · starts ${new Date(code.startsAt).toLocaleDateString()}` : ''}
            {code.expiresAt != null ? ` · expires ${new Date(code.expiresAt).toLocaleDateString()}` : ''}
            {expired ? ' · expired' : notYetStarted ? ' · not started' : usedUp ? ' · fully redeemed' : ''}
          </Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={onToggle} disabled={busy} hitSlop={8}>
          <Ionicons name={code.active ? 'checkmark-circle' : 'close-circle'} size={22} color={code.active ? '#16A34A' : '#94A3B8'} />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={onDelete} disabled={busy} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color="#DC2626" />
        </Pressable>
      </View>

      {code.announceOnSite ? (
        <Pressable
          style={styles.announceActiveBtn}
          disabled={busy}
          onPress={() => showAlert('Stop announcing?', 'Removes the on-site banner for this code.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Stop', style: 'destructive', onPress: () => onAnnounce(null) },
          ])}
        >
          <Ionicons name="megaphone" size={14} color="#7C3AED" />
          <Text style={styles.announceActiveText}>Announcing on site — tap to stop</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.announceBtn} disabled={busy} onPress={() => setPickingDuration((v) => !v)}>
          <Ionicons name="megaphone-outline" size={14} color="#64748B" />
          <Text style={styles.announceBtnText}>Announce on site</Text>
        </Pressable>
      )}

      {pickingDuration && (
        <View style={styles.durationRow}>
          {DURATION_PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              style={styles.durationChip}
              onPress={() => {
                setPickingDuration(false);
                onAnnounce(preset.ms);
              }}
            >
              <Text style={styles.durationChipText}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function DiscountCodesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sellerCurrency, setSellerCurrency] = useState<string | undefined>(undefined);
  const sym = currencySymbol(sellerCurrency);

  const [codeInput, setCodeInput] = useState('');
  const [kind, setKind] = useState<DiscountKind>('order');
  const [type, setType] = useState<DiscountType>('percent');
  const [amount, setAmount] = useState('');
  const [targetProductName, setTargetProductName] = useState('');
  const [bogoBuyQuantity, setBogoBuyQuantity] = useState('');
  const [bogoGetQuantity, setBogoGetQuantity] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [startsInDays, setStartsInDays] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [announceOnSite, setAnnounceOnSite] = useState(false);
  const [announceDurationMs, setAnnounceDurationMs] = useState<number | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');

  useEffect(() => {
    if (!user) return;
    return discountCodesStore.subscribe(user.uid, setCodes);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return sellerAccountStore.subscribe(user.uid, (account) => setSellerCurrency(account?.currency));
  }, [user]);

  const resetForm = () => {
    setCodeInput('');
    setAmount('');
    setTargetProductName('');
    setBogoBuyQuantity('');
    setBogoGetQuantity('');
    setMaxRedemptions('');
    setStartsInDays('');
    setExpiresInDays('');
    setAnnounceOnSite(false);
    setAnnounceDurationMs(null);
    setCustomMinutes('');
  };

  const handleCreate = async () => {
    if (!codeInput.trim()) {
      showAlert('Missing code', 'Enter a code, e.g. SUMMER20.');
      return;
    }
    let bogoBuyValue = 0;
    let bogoGetValue = 0;
    if (kind === 'bogo') {
      bogoBuyValue = parseInt(bogoBuyQuantity, 10);
      bogoGetValue = parseInt(bogoGetQuantity, 10);
      if (!Number.isFinite(bogoBuyValue) || bogoBuyValue < 1) {
        showAlert('Missing quantity', 'Enter how many the buyer must buy, e.g. 2.');
        return;
      }
      if (!Number.isFinite(bogoGetValue) || bogoGetValue < 1) {
        showAlert('Missing quantity', 'Enter how many the buyer gets free, e.g. 1.');
        return;
      }
      if (!targetProductName.trim()) {
        showAlert('Missing product', 'Enter the exact product name this applies to.');
        return;
      }
    } else {
      const amountValue = parseFloat(amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        showAlert('Invalid amount', type === 'percent' ? 'Enter a percent between 1 and 100.' : 'Enter an amount greater than 0.');
        return;
      }
      if (kind === 'item' && !targetProductName.trim()) {
        showAlert('Missing product', 'Enter the exact product name this applies to.');
        return;
      }
    }
    if (announceOnSite && announceDurationMs == null) {
      showAlert('Pick a duration', 'Choose how long to display the on-site notification.');
      return;
    }

    setCreating(true);
    try {
      const amountValue = parseFloat(amount) || 100;
      const maxRedemptionsValue = maxRedemptions.trim() ? parseInt(maxRedemptions, 10) : null;
      const startsInDaysValue = startsInDays.trim() ? parseInt(startsInDays, 10) : null;
      const expiresInDaysValue = expiresInDays.trim() ? parseInt(expiresInDays, 10) : null;
      await createDiscountCode({
        code: codeInput,
        kind,
        type,
        amount: amountValue,
        targetProductName: kind === 'item' || kind === 'bogo' ? targetProductName.trim() : null,
        bogoBuyQuantity: kind === 'bogo' ? bogoBuyValue : null,
        bogoGetQuantity: kind === 'bogo' ? bogoGetValue : null,
        maxRedemptions: maxRedemptionsValue != null && Number.isFinite(maxRedemptionsValue) ? maxRedemptionsValue : null,
        startsAt: startsInDaysValue != null && Number.isFinite(startsInDaysValue) ? Date.now() + startsInDaysValue * 86400000 : null,
        expiresAt: expiresInDaysValue != null && Number.isFinite(expiresInDaysValue) ? Date.now() + expiresInDaysValue * 86400000 : null,
        announceOnSite,
        announceDurationMs,
      });
      resetForm();
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

  const handleAnnounce = async (code: DiscountCode, durationMs: number | null) => {
    setBusyCode(code.code);
    try {
      await setDiscountCodeAnnouncement(code.code, durationMs != null, durationMs);
    } catch (err: any) {
      showAlert('Could not update announcement', err?.message ?? 'Try again in a moment.');
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

            <Text style={styles.fieldLabel}>What does it discount?</Text>
            <View style={styles.rowButtonsWrap}>
              {KIND_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.kind}
                  style={[styles.toggleBtn, kind === opt.kind && styles.toggleBtnActive]}
                  onPress={() => setKind(opt.kind)}
                >
                  <Text style={[styles.toggleBtnText, kind === opt.kind && styles.toggleBtnTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            {(kind === 'item' || kind === 'bogo') && (
              <TextInput
                style={styles.input}
                value={targetProductName}
                onChangeText={setTargetProductName}
                placeholder="Exact product name, e.g. Cozy Hoodie"
                placeholderTextColor="#94A3B8"
              />
            )}

            {kind === 'bogo' ? (
              <View style={styles.rowButtons}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={bogoBuyQuantity}
                  onChangeText={setBogoBuyQuantity}
                  placeholder="Buy how many, e.g. 2"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={bogoGetQuantity}
                  onChangeText={setBogoGetQuantity}
                  placeholder="Get free, e.g. 1"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                />
              </View>
            ) : (
              <>
                <View style={styles.rowButtons}>
                  <Pressable style={[styles.toggleBtn, type === 'percent' && styles.toggleBtnActive]} onPress={() => setType('percent')}>
                    <Text style={[styles.toggleBtnText, type === 'percent' && styles.toggleBtnTextActive]}>% Percent off</Text>
                  </Pressable>
                  <Pressable style={[styles.toggleBtn, type === 'fixed' && styles.toggleBtnActive]} onPress={() => setType('fixed')}>
                    <Text style={[styles.toggleBtnText, type === 'fixed' && styles.toggleBtnTextActive]}>{sym} Fixed amount off</Text>
                  </Pressable>
                </View>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder={
                    kind === 'shipping'
                      ? type === 'percent'
                        ? 'e.g. 100 (for free shipping)'
                        : 'e.g. 5.00 off shipping'
                      : type === 'percent'
                        ? 'e.g. 20 (for 20%)'
                        : 'e.g. 5.00'
                  }
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                />
              </>
            )}

            <View style={styles.rowButtons}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={maxRedemptions}
                onChangeText={setMaxRedemptions}
                placeholder="Max uses (blank = unlimited)"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.rowButtons}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={startsInDays}
                onChangeText={setStartsInDays}
                placeholder="Starts in days (blank = now)"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={expiresInDays}
                onChangeText={setExpiresInDays}
                placeholder="Expires in days (blank = never)"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
              />
            </View>

            <Pressable style={styles.announceToggleRow} onPress={() => setAnnounceOnSite((v) => !v)}>
              <Ionicons name={announceOnSite ? 'checkbox' : 'square-outline'} size={20} color={announceOnSite ? '#7C3AED' : '#94A3B8'} />
              <Text style={styles.announceToggleText}>Show a real notification banner on my site</Text>
            </Pressable>

            {announceOnSite && (
              <>
                <Text style={styles.fieldLabel}>How long should it display?</Text>
                <View style={styles.rowButtonsWrap}>
                  {DURATION_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.label}
                      style={[styles.toggleBtn, announceDurationMs === preset.ms && styles.toggleBtnActive]}
                      onPress={() => {
                        setAnnounceDurationMs(preset.ms);
                        setCustomMinutes('');
                      }}
                    >
                      <Text style={[styles.toggleBtnText, announceDurationMs === preset.ms && styles.toggleBtnTextActive]}>{preset.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={customMinutes}
                  onChangeText={(t) => {
                    setCustomMinutes(t);
                    const minutes = parseFloat(t);
                    setAnnounceDurationMs(Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : null);
                  }}
                  placeholder="Or custom: minutes"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                />
              </>
            )}

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
          <CodeRow
            code={item}
            currencySym={sym}
            onToggle={() => handleToggle(item)}
            onDelete={() => handleDelete(item)}
            onAnnounce={(durationMs) => handleAnnounce(item, durationMs)}
            busy={busyCode === item.code}
          />
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
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, marginTop: 2 },
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
  rowButtonsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  toggleBtn: { flex: 1, minWidth: 90, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#111827', borderColor: '#111827' },
  toggleBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  toggleBtnTextActive: { color: '#FFFFFF' },
  announceToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingVertical: 4 },
  announceToggleText: { fontSize: 13, fontWeight: '600', color: '#0F172A', flexShrink: 1 },
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  summaryText: { fontSize: 13, color: '#4338CA', fontWeight: '700', marginTop: 2 },
  metaText: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  iconBtn: { padding: 2 },
  announceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  announceBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  announceActiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  announceActiveText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  durationChip: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  durationChipText: { fontSize: 11, fontWeight: '600', color: '#0F172A' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
