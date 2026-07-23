import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Project, CanvasElement } from '@/types';
import { projectsStore } from '@/storage/projectsStore';
import ElementRenderer from '@/components/canvas/ElementRenderer';

interface Props {
  uid: string;
  projectId: string;
  // The available box to fit the preview into -- the actual rendered frame is derived from
  // the real project's canvasSize (square logo, 9:16 social, tall website, or any custom
  // size) scaled down to fit inside this box, so the preview always matches the true page
  // shape instead of being squashed into one fixed rectangle regardless of page type.
  maxWidth: number;
  maxHeight: number;
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
export default function LivePreviewCanvas({ uid, projectId, maxWidth, maxHeight }: Props) {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    const unsubscribe = projectsStore.subscribe(uid, projectId, setProject);
    return unsubscribe;
  }, [uid, projectId]);

  const hasContent = !!project && project.elements.length > 0;
  // Default to a portrait 9:16-ish shape before the project doc (and its real canvasSize)
  // has loaded, so the frame doesn't flash as a stretched-out landscape box for a beat.
  const canvasSize = project?.canvasSize ?? { width: 390, height: 693 };
  const scale = Math.min(maxWidth / canvasSize.width, maxHeight / canvasSize.height, 1);
  const frameWidth = Math.round(canvasSize.width * scale);
  const frameHeight = Math.round(canvasSize.height * scale);

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
                style={{
                  position: 'absolute',
                  left: scaledEl.x,
                  top: scaledEl.y,
                  width: scaledEl.width,
                  height: scaledEl.height,
                  overflow: 'hidden',
                }}
              >
                <ElementRenderer element={scaledEl} allElements={project!.elements} />
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
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
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
