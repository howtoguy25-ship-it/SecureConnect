import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, PanResponder, PanResponderInstance } from 'react-native';
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

// Matches `list.gap` + a row's real rendered height below -- used to convert a hold-and-drag
// gesture's raw pixel distance into "how many rows has this crossed," so a real physical
// drag distance always corresponds to the same number of position swaps regardless of how
// far/fast the finger moved.
const ROW_GAP = 6;
const DEFAULT_ROW_HEIGHT = 52;

interface RowProps {
  el: CanvasElement;
  index: number;
  count: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onToggleLock: (id: string) => void;
  rowHeightRef: React.MutableRefObject<number>;
}

function LayerRow({ el, index, count, isSelected, onSelect, onReorder, onToggleLock, rowHeightRef }: RowProps) {
  // Refs mirror the latest props so the drag handle's PanResponder (created exactly once
  // below) always acts on up-to-date data -- reorder calls made mid-drag re-render this row
  // with a new `index` on every swap, and a stale closure here would either swap the wrong
  // number of steps or stop responding partway through a fast drag.
  const indexRef = useRef(index);
  indexRef.current = index;
  const countRef = useRef(count);
  countRef.current = count;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const elIdRef = useRef(el.id);
  elIdRef.current = el.id;
  const dragState = useRef({ startIndex: index, appliedSteps: 0 });
  const [dragging, setDragging] = React.useState(false);

  const dragResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragState.current = { startIndex: indexRef.current, appliedSteps: 0 };
        setDragging(true);
      },
      onPanResponderMove: (_evt, gestureState) => {
        const step = rowHeightRef.current + ROW_GAP;
        const desiredSteps = Math.round(gestureState.dy / step);
        // Applies one swap per row boundary crossed, immediately, in the direction the
        // finger actually moved -- a fast drag across several rows swaps through each of
        // them in order rather than jumping straight to a final position.
        while (dragState.current.appliedSteps < desiredSteps) {
          const currentIndex = dragState.current.startIndex + dragState.current.appliedSteps;
          if (currentIndex >= countRef.current - 1) break;
          onReorderRef.current(elIdRef.current, 'down');
          dragState.current.appliedSteps += 1;
        }
        while (dragState.current.appliedSteps > desiredSteps) {
          const currentIndex = dragState.current.startIndex + dragState.current.appliedSteps;
          if (currentIndex <= 0) break;
          onReorderRef.current(elIdRef.current, 'up');
          dragState.current.appliedSteps -= 1;
        }
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    })
  ).current;

  return (
    <View
      style={[styles.row, isSelected && styles.rowSelected, dragging && styles.rowDragging]}
      onLayout={(e) => {
        if (e.nativeEvent.layout.height > 0) rowHeightRef.current = e.nativeEvent.layout.height;
      }}
    >
      <Pressable style={styles.rowMain} onPress={() => onSelect(el.id)} hitSlop={4}>
        <Ionicons name={iconForElement(el)} size={18} color={isSelected ? '#2563EB' : '#334155'} />
        <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]} numberOfLines={1}>
          {labelForElement(el)}
        </Text>
      </Pressable>
      <Pressable hitSlop={8} style={styles.rowIconBtn} onPress={() => onToggleLock(el.id)}>
        <Ionicons name={el.locked ? 'lock-closed' : 'lock-open-outline'} size={16} color="#64748B" />
      </Pressable>
      <Pressable hitSlop={8} style={styles.rowIconBtn} disabled={index === 0} onPress={() => onReorder(el.id, 'up')}>
        <Ionicons name="chevron-up" size={18} color={index === 0 ? '#E2E8F0' : '#334155'} />
      </Pressable>
      <Pressable
        hitSlop={8}
        style={styles.rowIconBtn}
        disabled={index === count - 1}
        onPress={() => onReorder(el.id, 'down')}
      >
        <Ionicons name="chevron-down" size={18} color={index === count - 1 ? '#E2E8F0' : '#334155'} />
      </Pressable>
      {/* Hold and drag up/down to reorder directly -- swaps happen immediately as each row
          boundary is crossed, rather than only one step per tap on the chevrons above. */}
      <View {...dragResponder.panHandlers} style={styles.dragHandle} hitSlop={8}>
        <Ionicons name="reorder-three-outline" size={20} color={dragging ? '#2563EB' : '#94A3B8'} />
      </View>
    </View>
  );
}

// A single element on the page has nothing to layer against, so reordering only makes
// sense -- and only shows -- once there are at least two, mirroring how Canva-style layers
// panels stay empty of overlap controls for a lone object.
export default function LayersPanel({ elements, selectedId, onSelect, onReorder, onToggleLock }: Props) {
  const topmostFirst = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  const rowHeightRef = useRef(DEFAULT_ROW_HEIGHT);

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
      {topmostFirst.map((el, index) => (
        <LayerRow
          key={el.id}
          el={el}
          index={index}
          count={topmostFirst.length}
          isSelected={el.id === selectedId}
          onSelect={onSelect}
          onReorder={onReorder}
          onToggleLock={onToggleLock}
          rowHeightRef={rowHeightRef}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyState: { padding: 24, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 20 },
  scrollFill: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 8, gap: ROW_GAP },
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
  rowDragging: { backgroundColor: '#DBEAFE', opacity: 0.9 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  rowLabelSelected: { color: '#2563EB' },
  rowIconBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  dragHandle: { paddingHorizontal: 4, paddingVertical: 2 },
});
