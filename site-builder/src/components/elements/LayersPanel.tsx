import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CanvasElement } from '@/types';
import { labelForElement, iconForElement } from '@/utils/elementLabel';

interface Props {
  elements: CanvasElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onToggleLock: (id: string) => void;
}

// A single element on the page has nothing to layer against, so reordering only makes
// sense -- and only shows -- once there are at least two, mirroring how Canva-style layers
// panels stay empty of overlap controls for a lone object.
export default function LayersPanel({ elements, selectedId, onSelect, onReorder, onToggleLock }: Props) {
  const topmostFirst = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  if (elements.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="layers-outline" size={22} color="#94A3B8" />
        <Text style={styles.emptyText}>Add an element to the page to see it here.</Text>
      </View>
    );
  }

  if (elements.length === 1) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="layers-outline" size={22} color="#94A3B8" />
        <Text style={styles.emptyText}>Only one item on the page — add another to layer, overlap, or stack them.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollFill} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
      {topmostFirst.map((el, index) => {
        const isSelected = el.id === selectedId;
        return (
          // A Pressable nested inside another Pressable is unreliable on iOS -- touches on
          // the lock/reorder icons could get swallowed by the row's own onPress instead of
          // firing their own, which is exactly what made tapping a layer (or its reorder
          // arrows) feel like it "doesn't work." Using a plain View for the row and keeping
          // every tappable icon as an independent sibling Pressable (not a child of another
          // Pressable) removes that ambiguity entirely.
          <View key={el.id} style={[styles.row, isSelected && styles.rowSelected]}>
            <Pressable style={styles.rowMain} onPress={() => onSelect(el.id)} hitSlop={4}>
              <Ionicons name={iconForElement(el)} size={18} color={isSelected ? '#2563EB' : '#334155'} />
              <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]} numberOfLines={1}>
                {labelForElement(el)}
              </Text>
            </Pressable>
            <Pressable hitSlop={8} style={styles.rowIconBtn} onPress={() => onToggleLock(el.id)}>
              <Ionicons name={el.locked ? 'lock-closed' : 'lock-open-outline'} size={16} color="#64748B" />
            </Pressable>
            <Pressable
              hitSlop={8}
              style={styles.rowIconBtn}
              disabled={index === 0}
              onPress={() => onReorder(el.id, 'up')}
            >
              <Ionicons name="chevron-up" size={18} color={index === 0 ? '#E2E8F0' : '#334155'} />
            </Pressable>
            <Pressable
              hitSlop={8}
              style={styles.rowIconBtn}
              disabled={index === topmostFirst.length - 1}
              onPress={() => onReorder(el.id, 'down')}
            >
              <Ionicons name="chevron-down" size={18} color={index === topmostFirst.length - 1 ? '#E2E8F0' : '#334155'} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyState: { padding: 24, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 20 },
  scrollFill: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 8, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
  },
  rowSelected: { backgroundColor: '#EEF2FF' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  rowLabelSelected: { color: '#2563EB' },
  rowIconBtn: { paddingHorizontal: 4, paddingVertical: 2 },
});
