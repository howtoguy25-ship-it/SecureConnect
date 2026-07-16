import { CanvasSize, PageType } from '@/types';

export const CANVAS_SIZES: Record<PageType, CanvasSize> = {
  website: { width: 390, height: 844, label: 'Website (mobile-first page)' },
  video: { width: 390, height: 693, label: 'Video page (16:9 content area)' },
  social: { width: 390, height: 585, label: 'Social page (9:16 story/reel size)' },
  logo: { width: 390, height: 390, label: 'Logo page (square)' },
};

export const PAGE_TYPE_INFO: Record<
  PageType,
  { title: string; subtitle: string; icon: string }
> = {
  website: {
    title: 'Web Page',
    subtitle: 'A full site page you can fill with text, images, buttons and blocks.',
    icon: 'globe-outline',
  },
  video: {
    title: 'Video Page',
    subtitle: 'Built for editing & arranging video: cuts, splits, and sound overlay.',
    icon: 'videocam-outline',
  },
  social: {
    title: 'Social (9:16) Page',
    subtitle: 'Facebook/TikTok-style vertical size, perfect for social-first sites.',
    icon: 'phone-portrait-outline',
  },
  logo: {
    title: 'Logo Page',
    subtitle: 'A square canvas for designing a logo or brand mark.',
    icon: 'sparkles-outline',
  },
};
