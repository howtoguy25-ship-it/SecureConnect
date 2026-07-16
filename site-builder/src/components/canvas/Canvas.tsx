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
}

export default function Canvas({ project, selectedId, onSelect, onChange }: Props) {
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
