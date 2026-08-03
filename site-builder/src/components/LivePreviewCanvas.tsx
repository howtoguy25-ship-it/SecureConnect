import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Project, CanvasElement } from '@/types';
import { projectsStore } from '@/storage/projectsStore';
import ElementRenderer from '@/components/canvas/ElementRenderer';
import ElementErrorBoundary from '@/components/canvas/ElementErrorBoundary';

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

// Wraps one positioned element so its *first* appearance on screen fades in and gets a brief
// highlight ring -- makes each text/image/product/section visibly "land" one by one as the
// build streams in, instead of the whole canvas flat-repainting every time pushPreview() writes
// a new elements array. `isNew` is computed once per element id by the parent (via seenIdsRef)
// and passed in as the initial render value, so a React re-render of an already-seen element
// (e.g. a sibling finishing generation) never replays the animation.
function RevealingElement({ isNew, children }: { isNew: boolean; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const ringOpacity = useRef(new Animated.Value(isNew ? 1 : 0)).current;

  useEffect(() => {
    if (!isNew) return;
    Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    Animated.timing(ringOpacity, { toValue: 0, duration: 900, delay: 150, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={{ opacity, width: '100%', height: '100%' }}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.revealRing, { opacity: ringOpacity }]} />
    </Animated.View>
  );
}

// Read-only, scaled-down live render of the project doc the AI builder writes to
// incrementally (see previewProjectId on GenerationSession) -- reuses the same
// ElementRenderer the real editor uses, so what shows here is a real preview of what's
// actually been generated so far, not a mocked-up animation standing in for progress.
export default function LivePreviewCanvas({ uid, projectId, maxWidth, maxHeight }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  // Tracks which element ids have already been rendered at least once, so RevealingElement
  // only plays its fade-in/highlight the first time an id appears -- a stable React key means
  // the same component instance is reused across re-renders, so mutating this ref inline
  // during the render pass (rather than in an effect) is what lets `isNew` be correct on the
  // very first render each id ever gets, before any effect has had a chance to run.
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = projectsStore.subscribe(uid, projectId, setProject);
    return unsubscribe;
  }, [uid, projectId]);

  const hasContent = !!project && project.elements.length > 0;
  // Default to a portrait 9:16-ish shape before the project doc (and its real canvasSize)
  // has loaded, so the frame doesn't flash as a stretched-out landscape box for a beat.
  const canvasSize = project?.canvasSize ?? { width: 390, height: 693 };
  const bezel = 14;
  const screenMaxWidth = maxWidth - bezel * 2;
  const screenMaxHeight = maxHeight - bezel * 2;
  // Scale by width alone (never by the page's total height) -- a real generated site is a
  // tall scrolling page, often several times taller than one screen. Fitting the *whole*
  // page into maxHeight (the old behavior) forced the width ratio down to match, squashing
  // the frame into a tall narrow "bottle" instead of a device. A real device shows the page at
  // one true width-based zoom and lets the rest scroll off the bottom of the visible screen
  // -- so here the screen height is just a fixed viewport and anything below it is clipped
  // by overflow:hidden, exactly like scrolling would reveal it on an actual device.
  const scale = Math.min(screenMaxWidth / canvasSize.width, 1);
  const screenWidth = Math.round(canvasSize.width * scale);
  const screenHeight = screenMaxHeight;

  return (
    <View style={[styles.tabletBezel, { width: screenWidth + bezel * 2, height: screenHeight + bezel * 2, padding: bezel }]}>
      <View style={styles.camera} />
      <View
        style={[
          styles.screen,
          { width: screenWidth, height: screenHeight, backgroundColor: project?.backgroundColor ?? '#F1F5F9' },
        ]}
      >
        {!hasContent && <View style={styles.placeholderDot} />}
        {hasContent &&
          [...project!.elements]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((el) => {
              const scaledEl = scaleElement(el, scale);
              const isNew = !seenIdsRef.current.has(el.id);
              seenIdsRef.current.add(el.id);
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
                  <RevealingElement isNew={isNew}>
                    <ElementErrorBoundary>
                      <ElementRenderer element={scaledEl} allElements={project!.elements} />
                    </ElementErrorBoundary>
                  </RevealingElement>
                </View>
              );
            })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabletBezel: {
    borderRadius: 18,
    backgroundColor: '#1F2937',
    alignSelf: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  camera: {
    position: 'absolute',
    top: 5,
    alignSelf: 'center',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4B5563',
    zIndex: 2,
  },
  screen: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  revealRing: {
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#6366F1',
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
