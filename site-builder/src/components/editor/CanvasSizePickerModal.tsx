import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CanvasSize } from '@/types';
import { VIDEO_SIZE_PRESETS, VideoSizePreset, presetToCanvasSize, customSizeToCanvasSize } from '@/data/videoSizePresets';

type SizeUnit = 'px' | 'in' | 'cm' | 'mm';
const UNIT_TO_PX: Record<SizeUnit, number> = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
const UNITS: SizeUnit[] = ['px', 'in', 'cm', 'mm'];
const PREVIEW_MAX = 64;

// A small live-scaled rectangle showing the real aspect ratio of a preset or the custom size
// currently being typed -- exactly what Canva's own size picker shows next to each option, so
// picking "TikTok" vs "YouTube" is a real visual choice, not just two numbers.
function RatioPreview({ width, height }: { width: number; height: number }) {
  const scale = Math.min(PREVIEW_MAX / width, PREVIEW_MAX / height, 1);
  return (
    <View style={styles.ratioPreviewOuter}>
      <View style={[styles.ratioPreviewBox, { width: Math.max(4, width * scale), height: Math.max(4, height * scale) }]} />
    </View>
  );
}

// Real, working Canva-style size picker: prebuilt export sizes for the exact platforms this
// page's videos/reels are actually made for, plus a Custom option using the same px/in/cm/mm
// units as project creation. Selecting anything calls onSelect immediately -- the caller (the
// editor) applies it live via updateProject, so the canvas visibly resizes the instant you
// tap, not after some separate "apply" step.
export default function CanvasSizePickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (size: CanvasSize) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [unit, setUnit] = useState<SizeUnit>('px');
  const [widthText, setWidthText] = useState('1080');
  const [heightText, setHeightText] = useState('1920');

  const widthNum = parseFloat(widthText);
  const heightNum = parseFloat(heightText);
  const validSize = Number.isFinite(widthNum) && Number.isFinite(heightNum) && widthNum > 0 && heightNum > 0;
  const widthPxPreview = validSize ? widthNum * UNIT_TO_PX[unit] : 0;
  const heightPxPreview = validSize ? heightNum * UNIT_TO_PX[unit] : 0;

  const choosePreset = (preset: VideoSizePreset) => {
    onSelect(presetToCanvasSize(preset));
    onClose();
  };

  const confirmCustom = () => {
    if (!validSize) return;
    onSelect(customSizeToCanvasSize(widthPxPreview, heightPxPreview, `${widthNum}${unit} × ${heightNum}${unit}`));
    setCustomOpen(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Video Size</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color="#0F172A" />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Real export sizes -- pick one and this page's frame updates immediately.</Text>

        {!customOpen ? (
          <ScrollView contentContainerStyle={styles.list}>
            {VIDEO_SIZE_PRESETS.map((preset) => (
              <Pressable key={preset.id} style={styles.row} onPress={() => choosePreset(preset)}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name={preset.icon as any} size={22} color="#111827" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{preset.label}</Text>
                  <Text style={styles.rowSubtitle}>{preset.subtitle}</Text>
                </View>
                <RatioPreview width={preset.width} height={preset.height} />
              </Pressable>
            ))}

            <Pressable style={styles.row} onPress={() => setCustomOpen(true)}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="resize-outline" size={22} color="#111827" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Custom Size</Text>
                <Text style={styles.rowSubtitle}>Type an exact width and height</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.customPanel}>
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
                <RatioPreview width={widthPxPreview} height={heightPxPreview} />
                <Text style={styles.previewDims}>
                  {Math.round(widthPxPreview)} × {Math.round(heightPxPreview)} px
                </Text>
              </View>
            )}
            <Pressable style={[styles.confirmBtn, !validSize && { opacity: 0.5 }]} onPress={confirmCustom} disabled={!validSize}>
              <Text style={styles.confirmBtnText}>Apply Size</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setCustomOpen(false)}>
              <Text style={styles.cancelBtnText}>Back to Presets</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 50, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 6, marginBottom: 14 },
  list: { gap: 10, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rowIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  rowSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  ratioPreviewOuter: { width: PREVIEW_MAX, height: PREVIEW_MAX, alignItems: 'center', justifyContent: 'center' },
  ratioPreviewBox: { backgroundColor: '#EEF2FF', borderRadius: 3, borderWidth: 1.5, borderColor: '#818CF8' },
  customPanel: { paddingTop: 4 },
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
  previewDims: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 4 },
  confirmBtn: { marginTop: 20, backgroundColor: '#111827', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  cancelBtn: { marginTop: 10, alignItems: 'center' },
  cancelBtnText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});
