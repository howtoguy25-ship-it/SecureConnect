import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Project, CanvasElement } from '@/types';
import { projectsStore } from '@/storage/projectsStore';
import ElementRenderer from '@/components/canvas/ElementRenderer';

interface Props {
  uid: string;
  projectId: string;
  frameWidth: number;
  frameHeight: number;
}

// Scales every positional/size field by the same factor so the miniature preview is a real
// proportional render of the actual canvas being written, not just a crop of its top-left
// corner -- fontSize is the one field that doesn't already derive from width/height, so it's
// scaled explicitly; everything else (icons, shapes, images, buttons) sizes itself off the
// width/height already being scaled here.
function scaleElement(el: CanvasElement, scale: number): CanvasElement {
  const scaled: CanvasElement = { ...el, x: el.x * scale, y: el.y * scale, width: el.width * scale, height: el.height * scale };
  if (scaled.type === 'text') {
    scaled.fontSize = Math.max(6, el.type === 'text' ? el.fontSize * scale : 10);
  }
  return scaled;
}

// Read-only, scaled-down live render of the project doc the AI builder writes to
// incrementally (see previewProjectId on GenerationSession) -- reuses the same
// ElementRenderer the real editor uses, so what shows here is a real preview of what's
// actually been generated so far, not a mocked-up animation standing in for progress.
export default function LivePreviewCanvas({ uid, projectId, frameWidth, frameHeight }: Props) {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    const unsubscribe = projectsStore.subscribe(uid, projectId, setProject);
    return unsubscribe;
  }, [uid, projectId]);

  const hasContent = !!project && project.elements.length > 0;
  const scale = project ? Math.min(frameWidth / project.canvasSize.width, frameHeight / project.canvasSize.height) : 1;

  return (
    <View
      style={[
        styles.frame,
        { width: frameWidth, height: frameHeight, backgroundColor: project?.backgroundColor ?? '#F1F5F9' },
      ]}
    >
      {!hasContent && <View style={styles.placeholderDot} />}
      {hasContent &&
        [...project!.elements]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((el) => {
            const scaledEl = scaleElement(el, scale);
            return (
              <View
                key={el.id}
                style={{ position: 'absolute', left: scaledEl.x, top: scaledEl.y, width: scaledEl.width, height: scaledEl.height }}
              >
                <ElementRenderer element={scaledEl} />
              </View>
            );
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignSelf: 'center',
  },
  placeholderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C7D2FE',
    alignSelf: 'center',
    marginTop: '45%',
  },
});
