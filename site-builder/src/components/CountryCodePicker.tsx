import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COUNTRY_DIAL_CODES, CountryDialCode, countryFlagEmoji } from '@/data/countryCodes';

export default function CountryCodePicker({
  value,
  onChange,
}: {
  value: CountryDialCode;
  onChange: (country: CountryDialCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_DIAL_CODES;
    return COUNTRY_DIAL_CODES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q)
    );
  }, [query]);

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.flag}>{countryFlagEmoji(value.iso2)}</Text>
        <Text style={styles.dialCode}>{value.dialCode}</Text>
        <Ionicons name="chevron-down" size={16} color="#64748B" />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select a Country</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={26} color="#0F172A" />
            </Pressable>
          </View>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or code"
            autoFocus
          />
          <FlatList
            data={results}
            keyExtractor={(c) => c.iso2}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onChange(item);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <Text style={styles.rowFlag}>{countryFlagEmoji(item.iso2)}</Text>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowDialCode}>{item.dialCode}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  flag: { fontSize: 20 },
  dialCode: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  search: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  rowFlag: { fontSize: 22 },
  rowName: { flex: 1, fontSize: 15, color: '#0F172A' },
  rowDialCode: { fontSize: 14, color: '#64748B', fontWeight: '600' },
});
