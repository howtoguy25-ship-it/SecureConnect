import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnnouncementSettings } from '@/types';
import ColorSwatchRow from '@/components/inspector/ColorSwatchRow';
import { generateId } from '@/utils/id';

const MAX_BARS = 2;

export default function AnnouncementPanel({
  settings,
  onChange,
}: {
  settings: AnnouncementSettings;
  onChange: (patch: Partial<AnnouncementSettings>) => void;
}) {
  const addBar = () => {
    if (settings.bars.length >= MAX_BARS) return;
    onChange({
      bars: [
        ...settings.bars,
        { id: generateId('bar'), text: 'New announcement', backgroundColor: '#111827', textColor: '#FFFFFF' },
      ],
      enabled: true,
    });
  };

  const removeBar = (id: string) => {
    onChange({ bars: settings.bars.filter((b) => b.id !== id) });
  };

  const updateBar = (id: string, patch: Partial<AnnouncementSettings['bars'][number]>) => {
    onChange({ bars: settings.bars.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Announcement Bar</Text>
        <Switch value={settings.enabled} onValueChange={(enabled) => onChange({ enabled })} />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Auto-Sliding</Text>
        <Switch value={settings.autoSlide} onValueChange={(autoSlide) => onChange({ autoSlide })} />
      </View>

      {settings.bars.map((bar, idx) => (
        <View key={bar.id} style={styles.barCard}>
          <View style={styles.barHeader}>
            <Text style={styles.barTitle}>Bar {idx + 1}</Text>
            <Pressable onPress={() => removeBar(bar.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={bar.text}
            onChangeText={(text) => updateBar(bar.id, { text })}
            placeholder="Announcement text"
          />
          <ColorSwatchRow
            label="Background"
            value={bar.backgroundColor}
            onChange={(backgroundColor) => updateBar(bar.id, { backgroundColor })}
          />
          <ColorSwatchRow
            label="Text Color"
            value={bar.textColor}
            onChange={(textColor) => updateBar(bar.id, { textColor })}
          />
        </View>
      ))}

      {settings.bars.length < MAX_BARS ? (
        <Pressable style={styles.addBtn} onPress={addBar}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Announcement Bar ({settings.bars.length}/{MAX_BARS})</Text>
        </Pressable>
      ) : (
        <Text style={styles.limitText}>Maximum of {MAX_BARS} announcement bars reached.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  barCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  barTitle: { fontSize: 13, fontWeight: '700', color: '#334155' },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 20,
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  limitText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginBottom: 20 },
});
