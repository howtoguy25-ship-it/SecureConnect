import { CANVAS_SIZES } from '@/data/canvasSizes';
import { getTheme } from '@/data/themes';
import { PageType, Project } from '@/types';
import { generateId } from '@/utils/id';

export function createProject(name: string, pageType: PageType, themeId: string): Project {
  const theme = getTheme(themeId);
  const canvasSize = CANVAS_SIZES[pageType];
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
    announcements: {
      enabled: false,
      autoSlide: true,
      intervalMs: 4000,
      bars: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}
