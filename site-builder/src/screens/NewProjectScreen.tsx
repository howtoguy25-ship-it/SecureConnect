import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { PAGE_TYPE_INFO } from '@/data/canvasSizes';
import { PageType } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewProject'>;

const ORDER: PageType[] = ['website', 'video', 'social', 'logo'];

// Standard 96px-per-inch convention (same one CSS, Figma, and Canva all use), so a size
// typed here as "21 x 29.7 cm" (A4) lines up with what those tools call the same size.
type SizeUnit = 'px' | 'in' | 'cm' | 'mm';
const UNIT_TO_PX: Record<SizeUnit, number> = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
const UNITS: SizeUnit[] = ['px', 'in', 'cm', 'mm'];

export default function NewProjectScreen({ navigation }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [unit, setUnit] = useState<SizeUnit>('px');
  const [widthText, setWidthText] = useState('390');
  const [heightText, setHeightText] = useState('844');

  // Live Canva-style size preview -- a small glowing box scaled to the aspect ratio the
  // user is currently typing, so they can see roughly what shape the page will be before
  // committing to it, not just read two numbers.
  const widthNum = parseFloat(widthText);
  const heightNum = parseFloat(heightText);
  const validSize = Number.isFinite(widthNum) && Number.isFinite(heightNum) && widthNum > 0 && heightNum > 0;
  const widthPxPreview = validSize ? widthNum * UNIT_TO_PX[unit] : 0;
  const heightPxPreview = validSize ? heightNum * UNIT_TO_PX[unit] : 0;
  const PREVIEW_MAX = 110;
  const previewScale = validSize ? Math.min(PREVIEW_MAX / widthPxPreview, PREVIEW_MAX / heightPxPreview, 1) : 0;
  const previewWidth = Math.max(6, widthPxPreview * previewScale);
  const previewHeight = Math.max(6, heightPxPreview * previewScale);

  const startCustom = () => {
    const width = parseFloat(widthText);
    const height = parseFloat(heightText);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const widthPx = Math.round(width * UNIT_TO_PX[unit]);
    const heightPx = Math.round(height * UNIT_TO_PX[unit]);
    setCustomOpen(false);
    navigation.navigate('BuildMethod', {
      pageType: 'website',
      customSize: { width: widthPx, height: heightPx, label: `Custom (${width}${unit} × ${height}${unit})` },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>New Project</Text>
        <View style={{ width: 26 }} />
      </View>
      <Text style={styles.subtitle}>What do you want to build?</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {ORDER.map((pageType) => {
          const info = PAGE_TYPE_INFO[pageType];
          return (
            <Pressable
              key={pageType}
              style={styles.card}
              onPress={() => navigation.navigate('BuildMethod', { pageType })}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={info.icon as any} size={28} color="#111827" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{info.title}</Text>
                <Text style={styles.cardSubtitle}>{info.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </Pressable>
          );
        })}

        <Pressable style={styles.card} onPress={() => setCustomOpen(true)}>
          <View style={styles.iconWrap}>
            <Ionicons name="resize-outline" size={28} color="#111827" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Custom Size</Text>
            <Text style={styles.cardSubtitle}>Type an exact width and height in px, in, cm, or mm — same units Canva and Figma use.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </Pressable>
      </ScrollView>

      <Modal visible={customOpen} transparent animationType="fade" onRequestClose={() => setCustomOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom page size</Text>
            <View style={styles.sizeRow}>
              <View style={styles.sizeField}>
                <Text style={styles.fieldLabel}>Width</Text>
                <TextInput style={styles.sizeInput} value={widthText} onChangeText={setWidthText} keyboardType="numeric" />
              </View>
              <Text style={styles.sizeTimes}>&times;</Text>
              <View style={styles.sizeField}>
                <Text style={styles.fieldLabel}>Height</Text>
                <TextInput style={styles.sizeInput} value={heightText} onChangeText={setHeightText} keyboardType="numeric" />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Unit</Text>
            <View style={styles.unitRow}>
              {UNITS.map((u) => (
                <Pressable key={u} style={[styles.unitBtn, unit === u && styles.unitBtnActive]} onPress={() => setUnit(u)}>
                  <Text style={[styles.unitBtnText, unit === u && styles.unitBtnTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>
            {validSize && (
              <View style={styles.previewSection}>
                <Text style={styles.fieldLabel}>Preview</Text>
                <View style={styles.previewOuter}>
                  <View style={[styles.previewBox, { width: previewWidth, height: previewHeight }]} />
                </View>
                <Text style={styles.previewDims}>
                  {Math.round(widthPxPreview)} × {Math.round(heightPxPreview)} px
                </Text>
              </View>
            )}

            <Pressable style={styles.confirmBtn} onPress={startCustom}>
              <Text style={styles.confirmBtnText}>Continue</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setCustomOpen(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 14, color: '#64748B', paddingHorizontal: 20, marginTop: 12 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  cardSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 14 },
  sizeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  sizeField: { flex: 1 },
  sizeTimes: { fontSize: 16, color: '#94A3B8', paddingBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 10 },
  sizeInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  unitRow: { flexDirection: 'row', gap: 8 },
  unitBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center' },
  unitBtnActive: { backgroundColor: '#DBEAFE' },
  unitBtnText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  unitBtnTextActive: { color: '#2563EB' },
  previewSection: { marginTop: 16, alignItems: 'center' },
  previewOuter: {
    width: '100%',
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  previewBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#60A5FA',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  previewDims: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 8 },
  confirmBtn: { marginTop: 20, backgroundColor: '#111827', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  cancelBtn: { marginTop: 10, alignItems: 'center' },
  cancelBtnText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});
