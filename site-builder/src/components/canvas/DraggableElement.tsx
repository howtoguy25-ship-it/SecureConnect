import React, { useEffect, useRef, useState } from 'react';
import { View, PanResponder, PanResponderInstance, StyleSheet, Pressable, TextInput, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CanvasElement } from '@/types';
import ElementRenderer from '@/components/canvas/ElementRenderer';
import ElementErrorBoundary from '@/components/canvas/ElementErrorBoundary';
import { useGoogleFont } from '@/utils/useGoogleFont';

interface Props {
  element: CanvasElement;
  // Every sibling element on the same page -- only 'collection' elements read this, to
  // resolve their linked ProductElements' live name/price/images/stock at render time
  // instead of holding a copy that could drift out of sync.
  allElements: CanvasElement[];
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
  // Page-level "view lock" -- when true, every element on the page behaves as if it were
  // individually locked (no drag/resize/select), regardless of its own `element.locked`.
  // Unlike a real per-element lock, this doesn't show the little lock badge on every
  // element or persist anywhere -- it's a purely local, toggle-off-anytime viewing mode.
  forceLocked?: boolean;
  // Lets a locked button element jump straight to its linked Product/Collection when tapped
  // in the editor -- the same real behavior a published page gives visitors (see
  // linkTargetElementId's comment), so "lock the page to see how it really looks" is
  // actually true for buttons too, not just their visual chrome.
  onNavigateToElement?: (id: string) => void;
  // Handles a locked button's raw `link` field -- lets the caller (EditorScreen) decide
  // whether it's really an internal page-slug (switch pages in-editor, since Linking.openURL
  // can't do in-app navigation) or a genuine external URL/mailto/tel (open it for real).
  onOpenLink?: (link: string) => void;
  // Handles a locked button's scrollToY (an AI-generated "prebuilt tabs" nav button) --
  // scrolls the real canvas ScrollView to that Y, matching the same window.scrollTo the
  // published site does for the same button (see siteHtml.ts's button case).
  onScrollToY?: (y: number) => void;
  // How much smaller than real size the whole canvas is currently being rendered (see
  // EditorScreen's fitScale) -- a visual-only CSS transform, so every PanResponder below that
  // maps a raw finger-movement delta (reported in real screen pixels) onto this element's own
  // x/y/width/height (stored in UNSCALED canvas pixels) has to divide that delta by scale
  // first. Skipping this would make a drag/resize gesture feel too fast or too slow relative
  // to the finger, proportional to how much the canvas has been shrunk to fit the screen.
  // Defaults to 1 (no adjustment) for the common case where the canvas renders at real size.
  scale?: number;
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

// clampBoxToCanvas (used for a plain move) treats x/y as free -- pin whichever edge is
// out of bounds back inside, no matter which edge that pushes. That's wrong for a resize:
// dragging the RIGHT-side handle out has a FIXED left edge (the anchor corner never moves),
// so once the box would grow past the canvas's right edge, only the WIDTH should stop
// growing -- clampBoxToCanvas instead recomputed x from the (still-growing) width, which
// silently dragged the whole box's left edge backwards even though the user's finger was
// only ever moving further right. That's what read as the resize "blocking"/jumping instead
// of just stopping cleanly at the edge. This clamps each axis against whichever edge that
// corner actually anchors, so the anchor corner truly never moves during a resize.
function clampResizeToCanvas(box: Box, corner: Corner, canvasSize: { width: number; height: number }): Box {
  let { x, y, width, height } = box;
  if (corner === 'tr' || corner === 'br') {
    // Left edge anchored -- width can't push the right edge past canvasSize.width.
    width = Math.min(width, Math.max(0, canvasSize.width - x));
  } else {
    // Right edge anchored (origin.x + origin.width) -- x can't go below 0.
    if (x < 0) {
      width = Math.max(0, width + x);
      x = 0;
    }
  }
  if (corner === 'bl' || corner === 'br') {
    // Top edge anchored -- height can't push the bottom edge past canvasSize.height.
    height = Math.min(height, Math.max(0, canvasSize.height - y));
  } else {
    // Bottom edge anchored (origin.y + origin.height) -- y can't go below 0.
    if (y < 0) {
      height = Math.max(0, height + y);
      y = 0;
    }
  }
  return { x, y, width, height };
}

// Keeps a rotation angle inside (-180, 180] -- e.g. 190 -> -170, -185 -> 175 -- so it never
// grows unbounded across many spins and a straight-up compare against 0/180 stays simple.
function normalizeRotationDeg(deg: number): number {
  let n = deg % 360;
  if (n > 180) n -= 360;
  if (n <= -180) n += 360;
  return n;
}

// Canva-style "snap to straight": within this many degrees of exactly 0 or 180, the live
// rotation locks to that exact value instead of the raw (jittery-by-hand) gesture angle --
// this is what makes the small "0" straight-indicator meaningful (it only ever shows at a
// real, exact 0, never an almost-0 the user can't feel through a touchscreen).
const ROTATION_SNAP_DEG = 4;
function snapRotationDeg(deg: number): number {
  if (Math.abs(deg) < ROTATION_SNAP_DEG) return 0;
  if (Math.abs(Math.abs(deg) - 180) < ROTATION_SNAP_DEG) return deg > 0 ? 180 : -180;
  return deg;
}

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
  allElements,
  isSelected,
  onSelect,
  onChange,
  onDuplicate,
  onDelete,
  onToggleLock,
  canvasSize,
  onInteractionChange,
  forceLocked,
  onNavigateToElement,
  onOpenLink,
  onScrollToY,
  scale = 1,
}: Props) {
  const elementLocked = !!element.locked;
  const locked = elementLocked || !!forceLocked;
  const editable = element.type === 'text' || element.type === 'button';
  const textFontFamily = useGoogleFont(element.type === 'text' ? element.fontFamily : undefined);
  const [box, setBox] = useState<Box>(() =>
    clampBoxToCanvas({ x: element.x, y: element.y, width: element.width, height: element.height }, canvasSize)
  );
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  // Non-null only while actively dragging the rotate handle -- a live preview of the angle,
  // committed to element.rotation on release (same pattern as liveFontSize below).
  const [liveRotation, setLiveRotation] = useState<number | null>(null);
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
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const onInteractionChangeRef = useRef(onInteractionChange);
  onInteractionChangeRef.current = onInteractionChange;
  const liveFontSizeRef = useRef(liveFontSize);
  liveFontSizeRef.current = liveFontSize;
  const liveRotationRef = useRef(liveRotation);
  liveRotationRef.current = liveRotation;
  const interacting = useRef(false);
  const wrapperRef = useRef<View>(null);

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
      // Whether to give up this gesture if the surrounding canvas ScrollView asks to take
      // over (e.g. it's detected a real vertical scroll swipe). An element that was already
      // selected before this touch began keeps refusing (false) -- an in-progress
      // reposition drag must never be yanked away by the scroll mid-gesture. But an element
      // that WASN'T selected yet yields (true): a touch-and-drag that merely started on top
      // of an unselected element is far more likely to be "I'm trying to scroll the page"
      // than "I meant to grab this specific thing," so scrolling wins and the element stays
      // put -- only a real tap (handled separately below) selects it.
      onPanResponderTerminationRequest: () => !moveOrigin.current.wasSelected,
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
        // Raw screen-pixel delta -- tap-vs-drag detection (maxMove below) cares about how
        // far the finger actually moved, not the canvas's own (possibly shrunk) coordinates.
        const dx = touch.pageX - moveOrigin.current.x0;
        const dy = touch.pageY - moveOrigin.current.y0;
        moveOrigin.current.maxMove = Math.max(moveOrigin.current.maxMove, Math.hypot(dx, dy));
        // The element's stored x/y are in real canvas pixels, which move MORE than the
        // finger does whenever the canvas is rendered smaller than actual size (see `scale`'s
        // own comment) -- dividing by scale here is what keeps the drag feeling 1:1 with the
        // finger regardless of how much the canvas has been shrunk to fit the screen.
        const origin = moveOrigin.current.box;
        const s = scaleRef.current;
        setBox(clampBoxToCanvas({ ...origin, x: origin.x + dx / s, y: origin.y + dy / s }, canvasSizeRef.current));
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
          // See the move responder's identical comment -- divides the raw screen-pixel
          // delta by the canvas's current fit-scale so a resize handle also tracks the
          // finger 1:1 regardless of how much the canvas has been shrunk to fit the screen.
          const s = scaleRef.current;
          const dx = (touch.pageX - originRef.current.x0) / s;
          const dy = (touch.pageY - originRef.current.y0) / s;
          const minWidth = elementRef.current.type === 'product' ? MIN_PRODUCT_WIDTH : MIN_SIZE;
          const minHeight = elementRef.current.type === 'product' ? MIN_PRODUCT_HEIGHT : MIN_SIZE;
          const origin = originRef.current.box;
          const resized = resizeFromCorner(corner, origin, dx, dy, minWidth, minHeight);
          setBox(clampResizeToCanvas(resized, corner, canvasSizeRef.current));

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

  // Measured once per gesture (onPanResponderGrant), not on every move -- the canvas
  // ScrollView already disables scrolling for the duration of any interaction (see
  // onInteractionChange), so the element's on-screen center can't shift mid-gesture and a
  // single measure() is both correct and far cheaper than re-measuring every frame.
  const rotateOriginRef = useRef({ centerX: 0, centerY: 0, startAngleDeg: 0, startRotation: 0 });
  const rotateResponder = useRef<PanResponderInstance>(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !lockedRef.current,
      onMoveShouldSetPanResponder: () => !lockedRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        interacting.current = true;
        onInteractionChangeRef.current?.(true);
        const touch = evt.nativeEvent.touches[0] as Touch;
        const startRotation = elementRef.current.rotation || 0;
        wrapperRef.current?.measure((_x, _y, w, h, pageX, pageY) => {
          const centerX = pageX + w / 2;
          const centerY = pageY + h / 2;
          const startAngleDeg = (Math.atan2(touch.pageY - centerY, touch.pageX - centerX) * 180) / Math.PI;
          rotateOriginRef.current = { centerX, centerY, startAngleDeg, startRotation };
        });
      },
      onPanResponderMove: (evt) => {
        const touch = evt.nativeEvent.touches[0] as Touch;
        if (!touch) return;
        const { centerX, centerY, startAngleDeg, startRotation } = rotateOriginRef.current;
        const currentAngleDeg = (Math.atan2(touch.pageY - centerY, touch.pageX - centerX) * 180) / Math.PI;
        const next = normalizeRotationDeg(startRotation + (currentAngleDeg - startAngleDeg));
        setLiveRotation(snapRotationDeg(next));
      },
      onPanResponderRelease: () => {
        interacting.current = false;
        onInteractionChangeRef.current?.(false);
        if (liveRotationRef.current != null) onChangeRef.current({ rotation: liveRotationRef.current } as any);
        setLiveRotation(null);
      },
      onPanResponderTerminate: () => {
        interacting.current = false;
        onInteractionChangeRef.current?.(false);
        if (liveRotationRef.current != null) onChangeRef.current({ rotation: liveRotationRef.current } as any);
        setLiveRotation(null);
      },
    })
  ).current;

  const displayRotation = liveRotation ?? (element.rotation || 0);
  // Shows only mid-gesture, and only once the angle has actually snapped to dead straight --
  // disappears the instant the finger moves off 0 again or is lifted (liveRotation resets to
  // null on release), matching "shows while spun back straight, disappears when let go or
  // still adjusting away from it."
  const showStraightIndicator = liveRotation === 0;

  const liveElement = {
    ...element,
    width: box.width,
    height: box.height,
    ...(element.type === 'text' && liveFontSize != null ? { fontSize: liveFontSize } : null),
  } as CanvasElement;
  const toolbarBelow = box.y < 56;

  return (
    <View
      ref={wrapperRef}
      style={[
        styles.wrapper,
        { left: box.x, top: box.y, width: box.width, height: box.height, zIndex: element.zIndex },
        // Once locked, this should render exactly as the real, final page would -- the
        // dashed selection outline is edit-mode chrome, and leaving it up just because the
        // element still happens to be the last-selected one made a locked page look like it
        // was still mid-edit instead of a clean preview.
        isSelected && !locked && styles.selected,
      ]}
      {...moveResponder.panHandlers}
    >
      {/* Only the visual content spins -- the outer box above (and the resize handles/
      toolbar/rotate handle below) stay axis-aligned, so dragging a corner handle still means
      exactly what it looks like regardless of the element's current rotation. */}
      <View style={[styles.rotatingContent, displayRotation ? { transform: [{ rotate: `${displayRotation}deg` }] } : null]}>
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
                  // Always a fixed dark color here, not element.color -- the input box behind
                  // it is always solid white (see inlineInput.backgroundColor below), so text
                  // authored in a light/white color (common for captions meant to sit on dark
                  // backgrounds) would otherwise render white-on-white and look blank while
                  // typing, even though the real saved color is untouched and still applies
                  // once editing ends.
                  color: '#0F172A',
                  textAlign: element.align,
                  fontWeight: element.fontWeight,
                  ...(textFontFamily ? { fontFamily: textFontFamily } : null),
                }
              : { fontSize: 15, color: '#0F172A', textAlign: 'center', fontWeight: '600' },
          ]}
        />
      ) : locked && element.type === 'button' && (element.link || element.linkTargetElementId || element.scrollToY != null) ? (
        // Only mounted while locked -- the outer moveResponder above already goes inert once
        // locked (onStartShouldSetPanResponder returns false), so there's no responder to
        // compete with for the tap, unlike trying to add this to the unlocked/editable case.
        <Pressable
          style={{ width: '100%', height: '100%' }}
          onPress={() => {
            if (element.scrollToY != null) onScrollToY?.(element.scrollToY);
            else if (element.linkTargetElementId) onNavigateToElement?.(element.linkTargetElementId);
            else if (element.link) onOpenLink?.(element.link);
          }}
        >
          <ElementErrorBoundary>
            <ElementRenderer element={liveElement} allElements={allElements} locked={locked} />
          </ElementErrorBoundary>
        </Pressable>
      ) : (
        <ElementErrorBoundary>
          <ElementRenderer element={liveElement} allElements={allElements} locked={locked} />
        </ElementErrorBoundary>
      )}
      </View>

      {elementLocked && (
        // A real Pressable, not just a status indicator -- tapping it unlocks this one
        // element directly, without needing to open the Layers panel. Locked elements never
        // claim the move responder (see onStartShouldSetPanResponder above), so this touch
        // never has to compete with drag-to-move for the gesture.
        <Pressable style={styles.lockBadge} onPress={onToggleLock} hitSlop={8}>
          <Ionicons name="lock-closed" size={11} color="#FFFFFF" />
        </Pressable>
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
          {/* Sits on whichever side the action toolbar below ISN'T on, so the two never
          overlap regardless of where the element sits on the page. */}
          <View
            style={[styles.rotateHandle, toolbarBelow ? styles.rotateHandleAbove : styles.rotateHandleBelow]}
            {...rotateResponder.panHandlers}
          >
            <Ionicons name="sync" size={13} color="#FFFFFF" />
          </View>
          {showStraightIndicator && (
            <View
              style={[styles.straightIndicator, toolbarBelow ? styles.straightIndicatorAbove : styles.straightIndicatorBelow]}
            >
              <View style={styles.straightDot} />
              <Text style={styles.straightIndicatorText}>0°</Text>
            </View>
          )}
        </>
      )}

      {isSelected && !locked && !editing && (
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
  rotatingContent: { width: '100%', height: '100%' },
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
    // Sits straddling the top-left corner (like the resize handles' negative offsets)
    // instead of inside the box, where it was covering the first word/character of
    // whatever text or content started there.
    position: 'absolute',
    top: -9,
    left: -9,
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
  rotateHandle: {
    position: 'absolute',
    left: '50%',
    marginLeft: -13,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Always the side opposite wherever the action toolbar is currently rendered (see
  // toolbarAbove/toolbarBelow above) so the two floating controls never collide.
  rotateHandleAbove: { top: -46 },
  rotateHandleBelow: { bottom: -46 },
  straightIndicator: {
    position: 'absolute',
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0F172AE6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  straightIndicatorAbove: { top: -82 },
  straightIndicatorBelow: { bottom: -82 },
  straightDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4ADE80' },
  straightIndicatorText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
});
