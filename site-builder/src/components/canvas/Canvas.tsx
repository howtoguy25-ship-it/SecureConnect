import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Project } from '@/types';
import DraggableElement from '@/components/canvas/DraggableElement';
import AnnouncementBarView from '@/components/canvas/AnnouncementBarView';

interface Props {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: any) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string) => void;
  onInteractionChange?: (interacting: boolean) => void;
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
}: Props) {
  const sorted = [...project.elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <View
      style={[
        styles.canvas,
        { width: project.canvasSize.width, height: project.canvasSize.height, backgroundColor: project.backgroundColor },
      ]}
    >
      <AnnouncementBarView settings={project.announcements} />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} />
      {sorted.map((el) => (
        <DraggableElement
          key={el.id}
          element={el}
          isSelected={el.id === selectedId}
          onSelect={() => onSelect(el.id)}
          onChange={(patch) => onChange(el.id, patch)}
          onDuplicate={() => onDuplicate(el.id)}
          onDelete={() => onDelete(el.id)}
          onToggleLock={() => onToggleLock(el.id)}
          canvasSize={project.canvasSize}
          onInteractionChange={onInteractionChange}
        />
      ))}
    </View>
  );
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
