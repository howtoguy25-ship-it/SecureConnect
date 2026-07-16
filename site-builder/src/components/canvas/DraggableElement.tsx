import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CanvasElement } from '@/types';
import ElementRenderer from '@/components/canvas/ElementRenderer';

interface Props {
  element: CanvasElement;
  isSelected: boolean;
  locked?: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CanvasElement>) => void;
}

const MIN_SIZE = 24;

export default function DraggableElement({ element, isSelected, locked, onSelect, onChange }: Props) {
  const [box, setBox] = useState({ x: element.x, y: element.y, width: element.width, height: element.height });
  const dragStart = useRef({ x: element.x, y: element.y });
  const resizeStart = useRef({ width: element.width, height: element.height });
  const interacting = useRef(false);

  useEffect(() => {
    if (!interacting.current) {
      setBox({ x: element.x, y: element.y, width: element.width, height: element.height });
    }
  }, [element.x, element.y, element.width, element.height]);

  const moveResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !locked,
        onMoveShouldSetPanResponder: () => !locked,
        onPanResponderGrant: () => {
          onSelect();
          interacting.current = true;
          dragStart.current = { x: box.x, y: box.y };
        },
        onPanResponderMove: (_e, gesture) => {
          setBox((prev) => ({ ...prev, x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy }));
        },
        onPanResponderRelease: () => {
          interacting.current = false;
          onChange({ x: box.x, y: box.y });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, box.x, box.y]
  );

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !locked,
        onMoveShouldSetPanResponder: () => !locked,
        onPanResponderGrant: () => {
          interacting.current = true;
          resizeStart.current = { width: box.width, height: box.height };
        },
        onPanResponderMove: (_e, gesture) => {
          setBox((prev) => ({
            ...prev,
            width: Math.max(MIN_SIZE, resizeStart.current.width + gesture.dx),
            height: Math.max(MIN_SIZE, resizeStart.current.height + gesture.dy),
          }));
        },
        onPanResponderRelease: () => {
          interacting.current = false;
          onChange({ width: box.width, height: box.height });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, box.width, box.height]
  );

  const liveElement = { ...element, width: box.width, height: box.height } as CanvasElement;

  return (
    <View
      style={[
        styles.wrapper,
        { left: box.x, top: box.y, width: box.width, height: box.height, zIndex: element.zIndex },
        isSelected && !locked ? styles.selected : null,
      ]}
      {...moveResponder.panHandlers}
    >
      <ElementRenderer element={liveElement} />
      {isSelected && !locked && (
        <View style={styles.resizeHandle} {...resizeResponder.panHandlers}>
          <Ionicons name="resize" size={14} color="#FFFFFF" />
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
  resizeHandle: {
    position: 'absolute',
    right: -14,
    bottom: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
