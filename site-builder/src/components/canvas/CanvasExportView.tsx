import React, { forwardRef } from 'react';
import { View } from 'react-native';
import { Project } from '@/types';
import ElementRenderer from '@/components/canvas/ElementRenderer';
import ElementErrorBoundary from '@/components/canvas/ElementErrorBoundary';

// A hidden, full-resolution (true scale, no selection chrome) render of a project's elements
// -- used only as a capture target for react-native-view-shot's captureRef when downloading a
// real flat image of a Logo/Social composition (see imageExport.ts). Mirrors LivePreviewCanvas's
// render loop but at the canvas's real pixel size instead of a scaled-down preview, and skips
// the phone-bezel/placeholder chrome entirely since this view is never actually shown on
// screen -- it's mounted off-canvas purely so captureRef has real laid-out content to shoot.
const CanvasExportView = forwardRef<View, { project: Project }>(({ project }, ref) => {
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        width: project.canvasSize.width,
        height: project.canvasSize.height,
        backgroundColor: project.backgroundColor,
        overflow: 'hidden',
      }}
    >
      {[...project.elements]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((el) => (
          <View
            key={el.id}
            style={{
              position: 'absolute',
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              overflow: 'hidden',
            }}
          >
            <ElementErrorBoundary>
              <ElementRenderer element={el} allElements={project.elements} />
            </ElementErrorBoundary>
          </View>
        ))}
    </View>
  );
});

export default CanvasExportView;
