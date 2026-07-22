import { CANVAS_SIZES } from '@/data/canvasSizes';
import { getTheme } from '@/data/themes';
import { CanvasSize, PageType, Project } from '@/types';
import { generateId } from '@/utils/id';

export function createProject(name: string, pageType: PageType, themeId: string, customSize?: CanvasSize): Project {
  const theme = getTheme(themeId);
  const canvasSize = customSize ?? CANVAS_SIZES[pageType];
  const now = Date.now();

  // Seed layouts are authored for the tall "website" canvas; other page types
  // start from the theme's colors only so nothing overflows a shorter canvas.
  const elements = pageType === 'website' || pageType === 'logo' ? theme.seedElements.map((el) => ({ ...el, id: generateId('el') })) : [];

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
