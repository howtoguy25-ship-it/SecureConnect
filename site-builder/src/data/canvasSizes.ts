import { CanvasSize, PageType } from '@/types';

export const CANVAS_SIZES: Record<PageType, CanvasSize> = {
  website: { width: 390, height: 844, label: 'Website (mobile-first page)' },
  video: { width: 390, height: 693, label: 'Video page (16:9 content area)' },
  social: { width: 390, height: 585, label: 'Social page (9:16 story/reel size)' },
  logo: { width: 390, height: 390, label: 'Logo page (square)' },
};

export const PAGE_TYPE_INFO: Record<
  PageType,
  { title: string; subtitle: string; icon: string; emoji: string; accent: string; accentSoft: string; gradient: [string, string] }
> = {
  website: {
    title: 'Web Page',
    subtitle: 'A full site page you can fill with text, images, buttons and blocks.',
    icon: 'globe-outline',
    emoji: '🌐',
    accent: '#4F46E5',
    accentSoft: '#EEF2FF',
    gradient: ['#6366F1', '#4338CA'],
  },
  video: {
    title: 'Video Page',
    subtitle: 'Built for editing & arranging video: cuts, splits, and sound overlay.',
    icon: 'videocam-outline',
    emoji: '🎬',
    accent: '#DB2777',
    accentSoft: '#FCE7F3',
    gradient: ['#F472B6', '#BE185D'],
  },
  social: {
    title: 'Social (9:16) Page',
    subtitle: 'Facebook/TikTok-style vertical size, perfect for social-first sites.',
    icon: 'phone-portrait-outline',
    emoji: '📱',
    accent: '#0891B2',
    accentSoft: '#ECFEFF',
    gradient: ['#22D3EE', '#0E7490'],
  },
  logo: {
    title: 'Logo Page',
    subtitle: 'A square canvas for designing a logo or brand mark.',
    icon: 'sparkles-outline',
    emoji: '✨',
    accent: '#D97706',
    accentSoft: '#FFFBEB',
    gradient: ['#FBBF24', '#B45309'],
  },
};
