import React, { useEffect, useRef, useState } from 'react';
import { View, PanResponder, PanResponderInstance, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CanvasElement } from '@/types';
import ElementRenderer from '@/components/canvas/ElementRenderer';
import { useGoogleFont } from '@/utils/useGoogleFont';

interface Props {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CanvasElement>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  // The page's real frame -- 9:16 social, square logo, website, or any custom size. Every
  // drag/resize gesture below clamps against this so an element can never be moved or
  // stretched out past the edges of the page it's actually on.
  canvasSize: { width: number; height: number };
  // Tells the surrounding canvas ScrollView to disable its own scrolling while a
  // drag/resize is in progress. On web, a ScrollView's native scroll can still kick in
  // underneath an active PanResponder gesture (RN's responder-termination guarantees don't
  // fully carry over to react-native-web's DOM-based scrolling) -- which is exactly what
  // made moving/resizing a selected element also drag the whole page along with it.
  onInteractionChange?: (interacting: boolean) => void;
}

const MIN_TEXT_FONT_SIZE = 6;
const MAX_TEXT_FONT_SIZE = 200;

type Box = { x: number; y: number; width: number; height: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';

// Keeps a box fully inside the canvas frame: shrinks it to fit if it's larger than the
// frame itself, then pins x/y so no edge can sit outside [0, canvasSize].
function clampBoxToCanvas(box: Box, canvasSize: { width: number; height: number }): Box {
  const width = Math.min(box.width, canvasSize.width);
  const height = Math.min(box.height, canvasSize.height);
  const x = Math.max(0, Math.min(box.x, canvasSize.width - width));
  const y = Math.max(0, Math.min(box.y, canvasSize.height - height));
  return { x, y, width, height };
}

const MIN_SIZE = 24;
// A product card crams an image + name + price + stock line into whatever box it's given --
// below this it starts clipping or crowding those together unreadably, so (unlike every
// other element type) it gets a real floor instead of the generic 24x24 one.
const MIN_PRODUCT_WIDTH = 150;
const MIN_PRODUCT_HEIGHT = 170;
const TAP_MOVE_THRESHOLD = 6;

type Touch = { pageX: number; pageY: number };

function resizeFromCorner(corner: Corner, origin: Box, dx: number, dy: number, minWidth = MIN_SIZE, minHeight = MIN_SIZE): Box {
  let width = origin.width;
  let height = origin.height;
  if (corner === 'br' || corner === 'tr') width = origin.width + dx;
  else width = origin.width - dx;
  if (corner === 'bl' || corner === 'br') height = origin.height + dy;
  else height = origin.height - dy;
  width = Math.max(minWidth, width);
  height = Math.max(minHeight, height);

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
  canvasSize,
  onInteractionChange,
}: Props) {
  const locked = !!element.locked;
  const editable = element.type === 'text' || element.type === 'button';
  const textFontFamily = useGoogleFont(element.type === 'text' ? element.fontFamily : undefined);
  const [box, setBox] = useState<Box>(() =>
    clampBoxToCanvas({ x: element.x, y: element.y, width: element.width, height: element.height }, canvasSize)
  );
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  // Non-null only while actively resizing a text element from a corner handle -- a live,
  // Canva-style preview of the font scaling with the box, committed to the real element on
  // release.
  const [liveFontSize, setLiveFontSize] = useState<number | null>(null);

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
  const elementRef = useRef(element);
  elementRef.current = element;
  const isSelectedRef = useRef(isSelected);
  isSelectedRef.current = isSelected;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  const onInteractionChangeRef = useRef(onInteractionChange);
  onInteractionChangeRef.current = onInteractionChange;
  const liveFontSizeRef = useRef(liveFontSize);
  liveFontSizeRef.current = liveFontSize;
  const interacting = useRef(false);

  useEffect(() => {
    if (!interacting.current) {
      setBox(clampBoxToCanvas({ x: element.x, y: element.y, width: element.width, height: element.height }, canvasSizeRef.current));
    }
  }, [element.x, element.y, element.width, element.height, canvasSize.width, canvasSize.height]);

  const moveOrigin = useRef({ x0: 0, y0: 0, box, wasSelected: false, maxMove: 0 });

  const beginEdit = () => {
    const el = elementRef.current;
    if (el.type === 'text') setEditValue(el.text);
    else if (el.type === 'button') setEditValue(el.label);
    else return;
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const el = elementRef.current;
    if (el.type === 'text') onChangeRef.current({ text: editValue } as any);
    else if (el.type === 'button') onChangeRef.current({ label: editValue } as any);
  };

  const moveResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      // Only ever claim a single-finger touch -- a second finger landing means the user is
      // trying to pinch-zoom their *view* of the canvas to look closer, which must never
      // change the element's real stored size. Rejecting multi-touch here lets that gesture
      // pass through to the surrounding ScrollView's own (purely visual) zoom instead.
      onStartShouldSetPanResponder: (evt) => !lockedRef.current && evt.nativeEvent.touches.length === 1,
      onMoveShouldSetPanResponder: (evt) => !lockedRef.current && evt.nativeEvent.touches.length === 1,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        moveOrigin.current.wasSelected = isSelectedRef.current;
        moveOrigin.current.maxMove = 0;
        onSelectRef.current();
        interacting.current = true;
        onInteractionChangeRef.current?.(true);
        const touch = evt.nativeEvent.touches[0] as Touch;
        moveOrigin.current.x0 = touch.pageX;
        moveOrigin.current.y0 = touch.pageY;
        moveOrigin.current.box = boxRef.current;
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches as Touch[];
        if (touches.length !== 1) return;
        const touch = touches[0];
        const dx = touch.pageX - moveOrigin.current.x0;
        const dy = touch.pageY - moveOrigin.current.y0;
        moveOrigin.current.maxMove = Math.max(moveOrigin.current.maxMove, Math.hypot(dx, dy));
        const origin = moveOrigin.current.box;
        setBox(clampBoxToCanvas({ ...origin, x: origin.x + dx, y: origin.y + dy }, canvasSizeRef.current));
      },
      onPanResponderRelease: () => {
        interacting.current = false;
        onInteractionChangeRef.current?.(false);
        onChangeRef.current(boxRef.current);
        // A tap (negligible movement) on an element that was *already* selected means the
        // user is trying to edit its text/label directly, not re-select or drag it --
        // matches how Canva/Figma-style editors distinguish "select" from "edit."
        if (moveOrigin.current.wasSelected && moveOrigin.current.maxMove < TAP_MOVE_THRESHOLD) {
          beginEdit();
        }
      },
      onPanResponderTerminate: () => {
        interacting.current = false;
        onInteractionChangeRef.current?.(false);
        onChangeRef.current(boxRef.current);
      },
    })
  ).current;

  function useCornerResponder(corner: Corner) {
    const originRef = useRef({ x0: 0, y0: 0, box: box, fontSize: 0 });
    return useRef<PanResponderInstance>(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !lockedRef.current,
        onMoveShouldSetPanResponder: () => !lockedRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          interacting.current = true;
          onInteractionChangeRef.current?.(true);
          const touch = evt.nativeEvent.touches[0] as Touch;
          const el = elementRef.current;
          originRef.current = {
            x0: touch.pageX,
            y0: touch.pageY,
            box: boxRef.current,
            fontSize: el.type === 'text' ? el.fontSize : 0,
          };
        },
        onPanResponderMove: (evt) => {
          const touch = evt.nativeEvent.touches[0] as Touch;
          if (!touch) return;
          const dx = touch.pageX - originRef.current.x0;
          const dy = touch.pageY - originRef.current.y0;
          const minWidth = elementRef.current.type === 'product' ? MIN_PRODUCT_WIDTH : MIN_SIZE;
          const minHeight = elementRef.current.type === 'product' ? MIN_PRODUCT_HEIGHT : MIN_SIZE;
          const origin = originRef.current.box;
          const resized = resizeFromCorner(corner, origin, dx, dy, minWidth, minHeight);
          setBox(clampBoxToCanvas(resized, canvasSizeRef.current));

          // Canva-style: dragging any corner in shrinks the text along with the box,
          // dragging out grows it -- instead of the old behavior where only the box
          // changed and the same-size text just crowded together or clipped inside it.
          // Scaled by the geometric mean of both axes so a stretch on just one side
          // doesn't distort the font size as dramatically as the box itself.
          if (elementRef.current.type === 'text' && originRef.current.fontSize > 0) {
            const widthRatio = resized.width / origin.width;
            const heightRatio = resized.height / origin.height;
            const scale = Math.sqrt(widthRatio * heightRatio);
            const nextFontSize = Math.round(
              Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, originRef.current.fontSize * scale))
            );
            setLiveFontSize(nextFontSize);
          }
        },
        onPanResponderRelease: () => {
          interacting.current = false;
          onInteractionChangeRef.current?.(false);
          if (elementRef.current.type === 'text' && liveFontSizeRef.current != null) {
            onChangeRef.current({ ...boxRef.current, fontSize: liveFontSizeRef.current } as any);
          } else {
            onChangeRef.current(boxRef.current);
          }
          setLiveFontSize(null);
        },
        onPanResponderTerminate: () => {
          interacting.current = false;
          onInteractionChangeRef.current?.(false);
          setLiveFontSize(null);
          onChangeRef.current(boxRef.current);
        },
      })
    ).current;
  }

  const tlResponder = useCornerResponder('tl');
  const trResponder = useCornerResponder('tr');
  const blResponder = useCornerResponder('bl');
  const brResponder = useCornerResponder('br');

  const liveElement = {
    ...element,
    width: box.width,
    height: box.height,
    ...(element.type === 'text' && liveFontSize != null ? { fontSize: liveFontSize } : null),
  } as CanvasElement;
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
      {editing && editable ? (
        <TextInput
          autoFocus
          multiline={element.type === 'text'}
          value={editValue}
          onChangeText={setEditValue}
          onBlur={commitEdit}
          onSubmitEditing={element.type === 'button' ? commitEdit : undefined}
          style={[
            styles.inlineInput,
            element.type === 'text'
              ? {
                  fontSize: element.fontSize,
                  color: element.color,
                  textAlign: element.align,
                  fontWeight: element.fontWeight,
                  ...(textFontFamily ? { fontFamily: textFontFamily } : null),
                }
              : { fontSize: 15, color: element.type === 'button' ? element.textColor : '#0F172A', textAlign: 'center', fontWeight: '600' },
          ]}
        />
      ) : (
        <ElementRenderer element={liveElement} />
      )}

      {locked && (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={11} color="#FFFFFF" />
        </View>
      )}

      {isSelected && !locked && !editing && (
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

      {isSelected && !editing && (
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
  inlineInput: {
    flex: 1,
    width: '100%',
    height: '100%',
    padding: 0,
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
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
