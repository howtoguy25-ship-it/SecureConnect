import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLUMN_LAYOUT_TEMPLATES, ColumnLayoutTemplate, buildColumnLayout } from '@/data/columnLayouts';

const PREVIEW_WIDTH = 280;
const PREVIEW_PADDING = 12;

// Renders the template at real proportions (same buildColumnLayout every real insert uses,
// just at a smaller width) -- a genuine preview of what lands on the page, not a fake icon.
function ColumnLayoutPreview({ template }: { template: ColumnLayoutTemplate }) {
  const { elements, height } = buildColumnLayout(template, PREVIEW_WIDTH - PREVIEW_PADDING * 2);
  return (
    <View style={[styles.previewBox, { width: PREVIEW_WIDTH, height: height + PREVIEW_PADDING * 2 }]}>
      {elements.map((el, i) =>
        el.kind === 'image' ? (
          <View
            key={i}
            style={[
              styles.previewImageCell,
              { left: el.x, top: el.y, width: el.width, height: el.height },
            ]}
          >
            <Ionicons name="image-outline" size={22} color="#94A3B8" />
          </View>
        ) : (
          <Text
            key={i}
            numberOfLines={el.fontWeight === 'bold' ? 1 : 2}
            style={{
              position: 'absolute',
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              fontSize: el.fontSize,
              fontWeight: el.fontWeight === 'bold' ? '700' : '400',
              color: el.color,
            }}
          >
            {el.text}
          </Text>
        )
      )}
    </View>
  );
}

// Browse the small library of pre-built column/row layouts (see columnLayouts.ts) with a
// real live preview -- arrows/dots to "swap through" options, then one Insert action. Used
// both from the global "+ Add to page" menu (lands as a new Section at the bottom of the
// page) and from an existing Section's own inspector ("Add columns", appends into that
// section instead) -- this modal itself doesn't know or care which, it just returns the
// chosen template.
export default function ColumnLayoutPickerModal({
  visible,
  onClose,
  onInsert,
}: {
  visible: boolean;
  onClose: () => void;
  onInsert: (template: ColumnLayoutTemplate) => void;
}) {
  const [index, setIndex] = useState(0);
  const template = COLUMN_LAYOUT_TEMPLATES[index];

  const close = () => {
    setIndex(0);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Columns</Text>
          <Pressable onPress={close} hitSlop={8}>
            <Ionicons name="close" size={26} color="#0F172A" />
          </Pressable>
        </View>

        <View style={styles.previewArea}>
          <Pressable
            style={styles.navBtn}
            onPress={() => setIndex((i) => (i - 1 + COLUMN_LAYOUT_TEMPLATES.length) % COLUMN_LAYOUT_TEMPLATES.length)}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={26} color="#4338CA" />
          </Pressable>
          <ColumnLayoutPreview template={template} />
          <Pressable
            style={styles.navBtn}
            onPress={() => setIndex((i) => (i + 1) % COLUMN_LAYOUT_TEMPLATES.length)}
            hitSlop={12}
          >
            <Ionicons name="chevron-forward" size={26} color="#4338CA" />
          </Pressable>
        </View>

        <Text style={styles.templateLabel}>{template.label}</Text>
        <View style={styles.dots}>
          {COLUMN_LAYOUT_TEMPLATES.map((t, i) => (
            <Pressable key={t.id} onPress={() => setIndex(i)} hitSlop={6}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.insertBtn}
          onPress={() => {
            onInsert(template);
            close();
          }}
        >
          <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.insertBtnText}>Insert This Layout</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 50, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  previewArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 },
  navBtn: { padding: 6 },
  previewBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  previewImageCell: {
    position: 'absolute',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateLabel: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 18 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0' },
  dotActive: { backgroundColor: '#4338CA' },
  insertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 28,
  },
  insertBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
