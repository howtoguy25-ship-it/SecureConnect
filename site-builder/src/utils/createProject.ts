import { CANVAS_SIZES } from '@/data/canvasSizes';
import { getTheme } from '@/data/themes';
import { CanvasElement, CanvasSize, PageType, Project } from '@/types';
import { generateId } from '@/utils/id';

// Every theme's seedElements is authored against the tall "website" canvas (see
// CANVAS_SIZES.website). Width is the same 390px across every page type, but height isn't --
// Social (585), Video (693), Logo (390, square), and any custom size are all shorter, so
// laying the raw seed coordinates straight onto one of those canvases either left about half
// of every theme's elements below the visible area (Logo) or -- for Social/Video, which used
// to just get an empty canvas instead -- meant picking a theme did nothing at all. Scaling Y
// (position, height, and font size) by how much shorter the real canvas is, while leaving X
// untouched (since width already matches), keeps every element's real horizontal design but
// compresses the vertical layout to actually fit inside the canvas the user picked.
const SEED_SOURCE_HEIGHT = CANVAS_SIZES.website.height;

function fitSeedElements(seedElements: CanvasElement[], canvasHeight: number): CanvasElement[] {
  const scaleY = canvasHeight / SEED_SOURCE_HEIGHT;
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
  const elements = fitSeedElements(theme.seedElements, canvasSize.height);

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
