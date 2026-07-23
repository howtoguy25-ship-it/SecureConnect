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
// A quick tap still selects the row -- only a hold past this delay (with the finger not
// having wandered more than TAP_MOVE_THRESHOLD px away) commits to a drag-to-reorder, so
// the two gestures never fight each other on the exact same touch.
const LONG_PRESS_MS = 300;
const TAP_MOVE_THRESHOLD = 6;

interface RowProps {
  el: CanvasElement;
  index: number;
  count: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onToggleLock: (id: string) => void;
  rowHeightRef: React.MutableRefObject<number>;
  // Lets the drag handle tell the surrounding ScrollView to stop scrolling for the
  // duration of the gesture -- on web, the ScrollView's own scroll can still respond to
  // the same touch underneath an active PanResponder drag, which is what made a hold-drag
  // here feel like it randomly stopped responding or scrolled the list instead of reordering.
  onDragStateChange: (dragging: boolean) => void;
}

function LayerRow({ el, index, count, isSelected, onSelect, onReorder, onToggleLock, rowHeightRef, onDragStateChange }: RowProps) {
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
  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const dragState = useRef({ startIndex: index, appliedSteps: 0 });
  const [dragging, setDragging] = React.useState(false);
  // How far the finger has moved past the row-boundary swaps already applied -- rendered as
  // a translateY so the row visibly lifts and follows the finger between slots, instead of
  // just snapping between list positions with no floating feedback. Bounded to roughly one
  // row's height either way since a full boundary crossing resets it back near zero (that
  // step having just been applied).
  const [liftY, setLiftY] = React.useState(0);
  // Tracks the hold-before-drag disambiguation: a long-press timer (cleared on quick
  // release or on excess movement) plus how far the finger has actually wandered, so a
  // normal tap-to-select still works from the exact same touch area as the drag gesture.
  const gesture = useRef({ timer: null as ReturnType<typeof setTimeout> | null, isDragging: false, maxMove: 0 });

  const dragResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        gesture.current.maxMove = 0;
        gesture.current.isDragging = false;
        gesture.current.timer = setTimeout(() => {
          if (gesture.current.maxMove >= TAP_MOVE_THRESHOLD) return;
          gesture.current.isDragging = true;
          dragState.current = { startIndex: indexRef.current, appliedSteps: 0 };
          setDragging(true);
          onDragStateChangeRef.current(true);
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (_evt, gestureState) => {
        gesture.current.maxMove = Math.max(gesture.current.maxMove, Math.abs(gestureState.dx), Math.abs(gestureState.dy));
        if (!gesture.current.isDragging) return;
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
        setLiftY(gestureState.dy - dragState.current.appliedSteps * step);
      },
      onPanResponderRelease: () => {
        if (gesture.current.timer) clearTimeout(gesture.current.timer);
        if (gesture.current.isDragging) {
          setDragging(false);
          setLiftY(0);
          onDragStateChangeRef.current(false);
        } else if (gesture.current.maxMove < TAP_MOVE_THRESHOLD) {
          // Never committed to a drag and barely moved -- a plain tap, so select like the
          // rest of the row's tappable area would.
          onSelectRef.current(elIdRef.current);
        }
        gesture.current.isDragging = false;
      },
      onPanResponderTerminate: () => {
        if (gesture.current.timer) clearTimeout(gesture.current.timer);
        setDragging(false);
        setLiftY(0);
        onDragStateChangeRef.current(false);
        gesture.current.isDragging = false;
      },
    })
  ).current;

  return (
    <View
      style={[
        styles.row,
        isSelected && styles.rowSelected,
        dragging && styles.rowDragging,
        dragging && { transform: [{ translateY: liftY }] },
      ]}
      onLayout={(e) => {
        if (e.nativeEvent.layout.height > 0) rowHeightRef.current = e.nativeEvent.layout.height;
      }}
    >
      {/* Holding anywhere on the label -- the row's "word" -- for a beat now starts a real
          drag-to-reorder, not just the small handle icon on the right. A quick tap here
          still selects the element like before; only a hold that doesn't wander commits to
          dragging (see the responder above), so the two gestures share this whole area
          without fighting each other. */}
      <View style={styles.rowMain} {...dragResponder.panHandlers}>
        <Ionicons name={iconForElement(el)} size={18} color={isSelected ? '#2563EB' : '#334155'} />
        <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]} numberOfLines={1}>
          {labelForElement(el)}
        </Text>
      </View>
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
      {/* Same hold-to-drag gesture as the label above -- kept as its own dedicated handle
          too since it's a clearer, more discoverable affordance than the label alone. */}
      <View
        {...dragResponder.panHandlers}
        style={[styles.dragHandle, dragging && styles.dragHandleActive]}
        hitSlop={10}
      >
        <Ionicons name="reorder-three-outline" size={26} color={dragging ? '#2563EB' : '#64748B'} />
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
  const [rowDragging, setRowDragging] = React.useState(false);

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
    <ScrollView
      style={styles.scrollFill}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.list}
      scrollEnabled={!rowDragging}
    >
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
          onDragStateChange={setRowDragging}
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
  // A real "lifted" look -- shadow + elevation + a higher zIndex so the dragged row visibly
  // floats above its neighbors while `liftY` (see the responder above) moves it with the
  // finger, rather than just recoloring it in place.
  rowDragging: {
    backgroundColor: '#DBEAFE',
    zIndex: 20,
    elevation: 10,
    shadowColor: '#1E293B',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  rowLabelSelected: { color: '#2563EB' },
  rowIconBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  dragHandle: {
    width: 44,
    height: 44,
    marginVertical: -6,
    marginRight: -4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dragHandleActive: { backgroundColor: '#DBEAFE' },
});
