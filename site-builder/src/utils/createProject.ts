import { CANVAS_SIZES } from '@/data/canvasSizes';
import { getTheme } from '@/data/themes';
import { CanvasElement, CanvasSize, PageType, Project } from '@/types';
import { generateId } from '@/utils/id';

// A 'website' theme's seedElements is authored against the tall "website" canvas (see
// CANVAS_SIZES.website); a Logo/Video/Social theme (theme.pageType set to that exact page
// type -- see Theme.pageType's comment) is instead authored directly at that page type's own
// native canvas size, since it's a real purpose-built layout, not a squished-down website.
// Scaling Y (position, height, and font size) by how much the real canvas differs from
// whichever of those the theme was actually authored against covers both cases with the same
// math -- a plain website theme opened at its own default size, or a custom website size,
// scales the old way; a Logo/Video/Social theme opened at its own matching default size comes
// out at scale 1 (no distortion at all).
function seedSourceHeight(themePageType: PageType | undefined): number {
  return CANVAS_SIZES[themePageType ?? 'website'].height;
}

function fitSeedElements(seedElements: CanvasElement[], canvasHeight: number, sourceHeight: number): CanvasElement[] {
  const scaleY = canvasHeight / sourceHeight;
  return seedElements.map((el) => {
    const scaled: CanvasElement = { ...el, id: generateId('el'), y: el.y * scaleY, height: el.height * scaleY };
    if (scaled.type === 'text') scaled.fontSize = Math.max(8, el.type === 'text' ? el.fontSize * scaleY : 12);
    return scaled;
  });
}

export function createProject(name: string, pageType: PageType, themeId: string, customSize?: CanvasSize): Project {
  const theme = getTheme(themeId);
  const canvasSize = customSize ?? CANVAS_SIZES[pageType];
  const now = Date.now();

  // Every page type gets the theme's real design now, scaled to actually fit the canvas it's
  // starting from -- see fitSeedElements above for why this used to leave Social/Video
  // completely blank and Logo missing roughly half its elements.
  const elements = fitSeedElements(theme.seedElements, canvasSize.height, seedSourceHeight(theme.pageType));

  return {
    id: generateId('project'),
    name,
    pageType,
    themeId,
    canvasSize,
    backgroundColor: theme.background,
    elements,
    // Only manually-built websites get a real multi-page structure -- Social/Logo/Video
    // stay single-page/fixed-card. `elements`/`backgroundColor` above double as "page 1"
    // (Home) for any older code that still reads them directly. The `pages` key must be
    // entirely absent (not present-with-value-undefined) for every other page type --
    // Firestore's setDoc() throws "Unsupported field value: undefined" otherwise, which is
    // exactly what broke creating a Logo/Video/Social project.
    ...(pageType === 'website'
      ? { pages: [{ id: generateId('page'), name: 'Home', slug: '', elements, backgroundColor: theme.background }] }
      : {}),
    announcements: {
      enabled: false,
      autoSlide: true,
      intervalMs: 4000,
      bars: [],
      popups: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}
