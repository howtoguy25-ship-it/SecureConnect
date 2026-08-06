import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CanvasElement, Project, TextElement } from '@/types';

const SWATCHES = [
  '#0F172A', '#111827', '#FFFFFF', '#2563EB', '#7C3AED',
  '#D4AF37', '#059669', '#DC2626', '#EA580C', '#DB2777',
];

// Fixed id for the single decorative background-word element a project can have --
// upserting by this id (rather than always adding a new one) is what lets switching
// Background Style or re-editing the word replace the old one instead of stacking up
// duplicates every time this modal is used.
const BOLD_TYPE_ID = 'theme-bg-text';

function isHex(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v);
}

// A giant, fully-opaque background word would fight with whatever's on top of it -- a
// fixed ~18% alpha keeps it readable as a decorative backdrop (the "real mock built
// theme" look the user asked for) no matter which swatch is picked.
function toBackdropAlpha(hex: string): string {
  return `${hex}2E`;
}

function ColorRow({ value, onChange }: { value?: string; onChange: (hex: string) => void }) {
  const [customText, setCustomText] = useState('');
  return (
    <View>
      <View style={styles.swatchRow}>
        {SWATCHES.map((hex) => (
          <Pressable
            key={hex}
            onPress={() => onChange(hex)}
            style={[
              styles.swatch,
              { backgroundColor: hex },
              value?.toUpperCase() === hex && styles.swatchSelected,
              hex === '#FFFFFF' && styles.swatchBorder,
            ]}
          />
        ))}
      </View>
      <View style={styles.customRow}>
        <TextInput
          style={styles.customInput}
          value={customText}
          onChangeText={setCustomText}
          placeholder="#RRGGBB (any colour)"
          autoCapitalize="none"
          maxLength={7}
        />
        <Pressable
          style={[styles.customApply, !isHex(customText) && styles.customApplyDisabled]}
          disabled={!isHex(customText)}
          onPress={() => onChange(customText)}
        >
          <Text style={styles.customApplyText}>Use</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ThemeCustomizerModal({
  visible,
  onClose,
  project,
  onUpdateProject,
}: {
  visible: boolean;
  onClose: () => void;
  project: Project;
  onUpdateProject: (patch: Partial<Project>) => void;
}) {
  const existingBoldType = project.elements.find((el) => el.id === BOLD_TYPE_ID) as TextElement | undefined;
  const [style, setStyle] = useState<'solid' | 'bold-type'>(existingBoldType ? 'bold-type' : 'solid');
  const [word, setWord] = useState(existingBoldType?.text ?? project.name.toUpperCase());
  const [wordColor, setWordColor] = useState('#D4AF37');

  const applyBackgroundColor = (hex: string) => {
    onUpdateProject({ backgroundColor: hex });
  };

  const applyBoldType = () => {
    const canvasWidth = project.canvasSize.width;
    const bgElement: TextElement = {
      id: BOLD_TYPE_ID,
      type: 'text',
      text: word.toUpperCase() || project.name.toUpperCase(),
      x: 0,
      y: Math.round(project.canvasSize.height / 2 - 70),
      width: canvasWidth,
      height: 140,
      zIndex: -1,
      fontSize: 64,
      color: toBackdropAlpha(wordColor),
      fontWeight: 'bold',
      align: 'center',
    };
    const withoutOld = project.elements.filter((el) => el.id !== BOLD_TYPE_ID);
    onUpdateProject({ elements: [...withoutOld, bgElement] as CanvasElement[] });
  };

  const switchToSolid = () => {
    setStyle('solid');
    onUpdateProject({ elements: project.elements.filter((el) => el.id !== BOLD_TYPE_ID) });
  };

  const applyAccentColor = (hex: string) => {
    const next = project.elements.map((el) => (el.type === 'button' ? { ...el, backgroundColor: hex } : el));
    onUpdateProject({ elements: next as CanvasElement[] });
  };

  const applyTextColor = (hex: string) => {
    const next = project.elements.map((el) => (el.type === 'text' && el.id !== BOLD_TYPE_ID ? { ...el, color: hex } : el));
    onUpdateProject({ elements: next as CanvasElement[] });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Customize Theme</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color="#0F172A" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.sectionTitle}>Background Style</Text>
          <View style={styles.segmented}>
            <Pressable
              style={[styles.segment, style === 'solid' && styles.segmentActive]}
              onPress={switchToSolid}
            >
              <Text style={[styles.segmentText, style === 'solid' && styles.segmentTextActive]}>Solid Color</Text>
            </Pressable>
            <Pressable
              style={[styles.segment, style === 'bold-type' && styles.segmentActive]}
              onPress={() => setStyle('bold-type')}
            >
              <Text style={[styles.segmentText, style === 'bold-type' && styles.segmentTextActive]}>Bold Type</Text>
            </Pressable>
          </View>

          {style === 'solid' ? (
            <>
              <Text style={styles.label}>Background Color</Text>
              <ColorRow value={project.backgroundColor} onChange={applyBackgroundColor} />
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                A giant, low-opacity word sits behind everything else on the page — a bold decorative backdrop, like a real pre-built theme, not a plain flat color.
              </Text>
              <Text style={styles.label}>Background Color (behind the word)</Text>
              <ColorRow value={project.backgroundColor} onChange={applyBackgroundColor} />
              <Text style={styles.label}>Word or Short Phrase</Text>
              <TextInput style={styles.wordInput} value={word} onChangeText={setWord} placeholder="BRAND" maxLength={16} />
              <Text style={styles.label}>Word Color</Text>
              <ColorRow value={wordColor} onChange={setWordColor} />
              <Pressable style={styles.applyButton} onPress={applyBoldType}>
                <Text style={styles.applyButtonText}>Apply Bold Type Background</Text>
              </Pressable>
            </>
          )}

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Accent Color</Text>
          <Text style={styles.hint}>Applies to every button on this page.</Text>
          <ColorRow onChange={applyAccentColor} />

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Text Color</Text>
          <Text style={styles.hint}>Applies to every text block on this page.</Text>
          <ColorRow onChange={applyTextColor} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 8, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '600', color: '#334155', marginTop: 14, marginBottom: 6 },
  hint: { fontSize: 12, color: '#64748B', lineHeight: 17, marginBottom: 6 },
  segmented: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: '#111827' },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  segmentTextActive: { color: '#FFFFFF' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchSelected: { borderWidth: 3, borderColor: '#2563EB' },
  swatchBorder: { borderWidth: 1, borderColor: '#E2E8F0' },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  customApply: { backgroundColor: '#111827', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  customApplyDisabled: { backgroundColor: '#CBD5E1' },
  customApplyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  wordInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  applyButton: { marginTop: 16, backgroundColor: '#111827', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  applyButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginVertical: 22 },
});
