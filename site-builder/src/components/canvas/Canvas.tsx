import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Project } from '@/types';
import DraggableElement from '@/components/canvas/DraggableElement';
import AnnouncementBarView from '@/components/canvas/AnnouncementBarView';
import { gradientStartEnd } from '@/utils/gradient';

interface Props {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: any) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string) => void;
  onInteractionChange?: (interacting: boolean) => void;
  // Page-level view lock -- see DraggableElement's forceLocked comment.
  forceLocked?: boolean;
}

export default function Canvas({
  project,
  selectedId,
  onSelect,
  onChange,
  onDuplicate,
  onDelete,
  onToggleLock,
  onInteractionChange,
  forceLocked,
}: Props) {
  const sorted = [...project.elements].sort((a, b) => a.zIndex - b.zIndex);
  const sizeStyle = { width: project.canvasSize.width, height: project.canvasSize.height };

  const content = (
    <>
      <AnnouncementBarView settings={project.announcements} />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} />
      {sorted.map((el) => (
        <DraggableElement
          key={el.id}
          element={el}
          allElements={project.elements}
          isSelected={el.id === selectedId}
          onSelect={() => onSelect(el.id)}
          onChange={(patch) => onChange(el.id, patch)}
          onDuplicate={() => onDuplicate(el.id)}
          onDelete={() => onDelete(el.id)}
          onToggleLock={() => onToggleLock(el.id)}
          canvasSize={project.canvasSize}
          onInteractionChange={onInteractionChange}
          forceLocked={forceLocked}
          onNavigateToElement={onSelect}
        />
      ))}
    </>
  );

  if (project.backgroundGradient) {
    const { start, end } = gradientStartEnd(project.backgroundGradient.angle);
    return (
      <LinearGradient colors={project.backgroundGradient.colors} start={start} end={end} style={[styles.canvas, sizeStyle]}>
        {content}
      </LinearGradient>
    );
  }

  return <View style={[styles.canvas, sizeStyle, { backgroundColor: project.backgroundColor }]}>{content}</View>;
}

const styles = StyleSheet.create({
  canvas: {
    overflow: 'hidden',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
