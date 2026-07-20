import React, { useEffect, useRef, useState } from 'react';
import { View, PanResponder, PanResponderInstance, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CanvasElement } from '@/types';
import ElementRenderer from '@/components/canvas/ElementRenderer';

interface Props {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CanvasElement>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
}

type Box = { x: number; y: number; width: number; height: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';

const MIN_SIZE = 24;

type Touch = { pageX: number; pageY: number };

function centroidAndSpread(touches: Touch[]) {
  const cx = touches.reduce((sum, t) => sum + t.pageX, 0) / touches.length;
  const cy = touches.reduce((sum, t) => sum + t.pageY, 0) / touches.length;
  const dist = touches.length >= 2 ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) : 0;
  return { cx, cy, dist };
}

function resizeFromCorner(corner: Corner, origin: Box, dx: number, dy: number): Box {
  let width = origin.width;
  let height = origin.height;
  if (corner === 'br' || corner === 'tr') width = origin.width + dx;
  else width = origin.width - dx;
  if (corner === 'bl' || corner === 'br') height = origin.height + dy;
  else height = origin.height - dy;
  width = Math.max(MIN_SIZE, width);
  height = Math.max(MIN_SIZE, height);

  let x = origin.x;
  let y = origin.y;
  if (corner === 'bl' || corner === 'tl') x = origin.x + origin.width - width;
  if (corner === 'tr' || corner === 'tl') y = origin.y + origin.height - height;

  return { x, y, width, height };
}

export default function DraggableElement({
  element,
  isSelected,
  onSelect,
  onChange,
  onDuplicate,
  onDelete,
  onToggleLock,
}: Props) {
  const locked = !!element.locked;
  const [box, setBox] = useState<Box>({ x: element.x, y: element.y, width: element.width, height: element.height });

  // Refs mirror the latest render's values so the PanResponders (created exactly once
  // below) never read stale closures -- and, just as importantly, never need to be
  // *recreated* mid-gesture. Recreating a PanResponder while a touch is active swaps out
  // its handler functions out from under the in-progress native gesture, which is what was
  // making elements feel "stuck" -- a drag would start, then silently stop responding to
  // further finger movement the instant local state (and therefore the old memoized
  // responder) changed.
  const boxRef = useRef(box);
  boxRef.current = box;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const interacting = useRef(false);

  useEffect(() => {
    if (!interacting.current) {
      setBox({ x: element.x, y: element.y, width: element.width, height: element.height });
    }
  }, [element.x, element.y, element.width, element.height]);

  const moveOrigin = useRef({ cx: 0, cy: 0, dist: 0, touchCount: 0, box: box });

  const moveResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !lockedRef.current,
      onMoveShouldSetPanResponder: () => !lockedRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        onSelectRef.current();
        interacting.current = true;
        const touches = evt.nativeEvent.touches as Touch[];
        const { cx, cy, dist } = centroidAndSpread(touches);
        moveOrigin.current = { cx, cy, dist, touchCount: touches.length, box: boxRef.current };
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches as Touch[];
        if (touches.length === 0) return;
        if (touches.length !== moveOrigin.current.touchCount) {
          // Finger count just changed (e.g. a second finger landed to start a pinch, or one
          // lifted back to a single-finger drag) -- rebase from the current box instead of
          // applying a delta against a touch layout that no longer matches, which would
          // otherwise jump the element.
          const { cx, cy, dist } = centroidAndSpread(touches);
          moveOrigin.current = { cx, cy, dist, touchCount: touches.length, box: boxRef.current };
          return;
        }
        const { cx, cy, dist } = centroidAndSpread(touches);
        const dx = cx - moveOrigin.current.cx;
        const dy = cy - moveOrigin.current.cy;
        const origin = moveOrigin.current.box;
        if (touches.length >= 2) {
          const scale = moveOrigin.current.dist > 0 ? dist / moveOrigin.current.dist : 1;
          const width = Math.max(MIN_SIZE, origin.width * scale);
          const height = Math.max(MIN_SIZE, origin.height * scale);
          setBox({
            width,
            height,
            x: origin.x + dx - (width - origin.width) / 2,
            y: origin.y + dy - (height - origin.height) / 2,
          });
        } else {
          setBox({ ...origin, x: origin.x + dx, y: origin.y + dy });
        }
      },
      onPanResponderRelease: () => {
        interacting.current = false;
        onChangeRef.current(boxRef.current);
      },
      onPanResponderTerminate: () => {
        interacting.current = false;
        onChangeRef.current(boxRef.current);
      },
    })
  ).current;

  function useCornerResponder(corner: Corner) {
    const originRef = useRef({ x0: 0, y0: 0, box: box });
    return useRef<PanResponderInstance>(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !lockedRef.current,
        onMoveShouldSetPanResponder: () => !lockedRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          interacting.current = true;
          const touch = evt.nativeEvent.touches[0] as Touch;
          originRef.current = { x0: touch.pageX, y0: touch.pageY, box: boxRef.current };
        },
        onPanResponderMove: (evt) => {
          const touch = evt.nativeEvent.touches[0] as Touch;
          if (!touch) return;
          const dx = touch.pageX - originRef.current.x0;
          const dy = touch.pageY - originRef.current.y0;
          setBox(resizeFromCorner(corner, originRef.current.box, dx, dy));
        },
        onPanResponderRelease: () => {
          interacting.current = false;
          onChangeRef.current(boxRef.current);
        },
        onPanResponderTerminate: () => {
          interacting.current = false;
          onChangeRef.current(boxRef.current);
        },
      })
    ).current;
  }

  const tlResponder = useCornerResponder('tl');
  const trResponder = useCornerResponder('tr');
  const blResponder = useCornerResponder('bl');
  const brResponder = useCornerResponder('br');

  const liveElement = { ...element, width: box.width, height: box.height } as CanvasElement;
  const toolbarBelow = box.y < 56;

  return (
    <View
      style={[
        styles.wrapper,
        { left: box.x, top: box.y, width: box.width, height: box.height, zIndex: element.zIndex },
        isSelected && styles.selected,
      ]}
      {...moveResponder.panHandlers}
    >
      <ElementRenderer element={liveElement} />

      {locked && (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={11} color="#FFFFFF" />
        </View>
      )}

      {isSelected && !locked && (
        <>
          <View style={[styles.resizeHandle, styles.handleTL]} {...tlResponder.panHandlers}>
            <Ionicons name="resize" size={12} color="#FFFFFF" />
          </View>
          <View style={[styles.resizeHandle, styles.handleTR]} {...trResponder.panHandlers}>
            <Ionicons name="resize" size={12} color="#FFFFFF" />
          </View>
          <View style={[styles.resizeHandle, styles.handleBL]} {...blResponder.panHandlers}>
            <Ionicons name="resize" size={12} color="#FFFFFF" />
          </View>
          <View style={[styles.resizeHandle, styles.handleBR]} {...brResponder.panHandlers}>
            <Ionicons name="resize" size={12} color="#FFFFFF" />
          </View>
        </>
      )}

      {isSelected && (
        <View style={[styles.toolbar, toolbarBelow ? styles.toolbarBelow : styles.toolbarAbove]}>
          <Pressable style={styles.toolbarBtn} onPress={onDuplicate} hitSlop={6}>
            <Ionicons name="copy-outline" size={16} color="#0F172A" />
          </Pressable>
          <View style={styles.toolbarDivider} />
          <Pressable style={styles.toolbarBtn} onPress={onToggleLock} hitSlop={6}>
            <Ionicons name={locked ? 'lock-closed' : 'lock-open-outline'} size={16} color="#0F172A" />
          </Pressable>
          <View style={styles.toolbarDivider} />
          <Pressable style={styles.toolbarBtn} onPress={onDelete} hitSlop={6}>
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute' },
  selected: {
    borderWidth: 2,
    borderColor: '#2563EB',
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  lockBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0F172ACC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandle: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBR: { right: -13, bottom: -13 },
  handleBL: { left: -13, bottom: -13 },
  handleTR: { right: -13, top: -13 },
  handleTL: { left: -13, top: -13 },
  toolbar: {
    position: 'absolute',
    left: '50%',
    marginLeft: -66,
    width: 132,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  toolbarAbove: { top: -46 },
  toolbarBelow: { bottom: -46 },
  toolbarBtn: { padding: 6 },
  toolbarDivider: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: '#E2E8F0' },
});
