import { Theme, TextElement, ShapeElement, ButtonElement } from '@/types';

function textEl(partial: Partial<TextElement> & Pick<TextElement, 'id' | 'text' | 'y'>): TextElement {
  return {
    type: 'text',
    x: 24,
    width: 342,
    height: 48,
    zIndex: 2,
    fontSize: 24,
    color: '#0F172A',
    fontWeight: 'bold',
    align: 'left',
    ...partial,
  };
}

function shapeEl(partial: Partial<ShapeElement> & Pick<ShapeElement, 'id' | 'y' | 'color'>): ShapeElement {
  return {
    type: 'shape',
    x: 0,
    width: 390,
    height: 220,
    zIndex: 0,
    shapeKind: 'rectangle',
    ...partial,
  };
}

function buttonEl(partial: Partial<ButtonElement> & Pick<ButtonElement, 'id' | 'y' | 'label'>): ButtonElement {
  return {
    type: 'button',
    x: 24,
    width: 160,
    height: 48,
    zIndex: 2,
    backgroundColor: '#111827',
    textColor: '#FFFFFF',
    borderRadius: 10,
    ...partial,
  };
}

export const THEMES: Theme[] = [
  {
    id: 'blank',
    name: 'Blank Page',
    tier: 'blank',
    price: 0,
    description: 'Start from nothing and build it your way.',
    swatch: ['#F3F4F6', '#E5E7EB'],
    background: '#FFFFFF',
    accent: '#111827',
    textColor: '#0F172A',
    seedElements: [],
  },
  {
    id: 'free-minimal',
    name: 'Minimal',
    tier: 'free',
    price: 0,
    description: 'Clean, simple, all-white starting point with a headline and button.',
    swatch: ['#FFFFFF', '#F1F5F9'],
    background: '#FFFFFF',
    accent: '#2563EB',
    textColor: '#0F172A',
    seedElements: [
      textEl({ id: 'seed-h1', text: 'Your Headline Here', y: 120, fontSize: 30, color: '#0F172A' }),
      textEl({ id: 'seed-sub', text: 'A short line about what you offer.', y: 168, fontSize: 15, color: '#475569', fontWeight: 'normal', height: 40 }),
      buttonEl({ id: 'seed-btn', label: 'Get Started', y: 224, backgroundColor: '#2563EB' }),
    ],
  },
  {
    id: 'free-bold',
    name: 'Bold Simple',
    tier: 'free',
    price: 0,
    description: 'Bright color block with punchy type.',
    swatch: ['#FEF3C7', '#FDE68A'],
    background: '#FFFBEB',
    accent: '#D97706',
    textColor: '#111827',
    seedElements: [
      shapeEl({ id: 'seed-block', y: 0, color: '#FDE68A', height: 180 }),
      textEl({ id: 'seed-h1', text: 'Say It Boldly', y: 60, fontSize: 32, color: '#111827' }),
      buttonEl({ id: 'seed-btn', label: 'Explore', y: 220, backgroundColor: '#D97706' }),
    ],
  },
  {
    id: 'free-soft',
    name: 'Soft Pastel',
    tier: 'free',
    price: 0,
    description: 'Gentle pastel palette for a friendly, approachable feel.',
    swatch: ['#E0E7FF', '#C7D2FE'],
    background: '#EEF2FF',
    accent: '#6366F1',
    textColor: '#1E1B4B',
    seedElements: [
      textEl({ id: 'seed-h1', text: 'Welcome', y: 120, fontSize: 30, color: '#1E1B4B' }),
      textEl({ id: 'seed-sub', text: 'A calm, friendly space to share your work.', y: 168, fontSize: 15, color: '#4338CA', fontWeight: 'normal', height: 40 }),
      buttonEl({ id: 'seed-btn', label: 'Learn More', y: 224, backgroundColor: '#6366F1' }),
    ],
  },
  {
    id: 'luxury-noir',
    name: 'Noir Luxury',
    tier: 'luxury',
    price: 189,
    description: 'Premium dark theme with gold accents, layered blocks and refined type.',
    swatch: ['#111827', '#D4AF37'],
    background: '#0B0B0D',
    accent: '#D4AF37',
    textColor: '#F5F5F4',
    seedElements: [
      shapeEl({ id: 'seed-block', y: 0, color: '#16161A', height: 260 }),
      textEl({ id: 'seed-h1', text: 'Timeless. Refined.', y: 90, fontSize: 30, color: '#F5F5F4' }),
      textEl({ id: 'seed-sub', text: 'A premium experience, crafted in every detail.', y: 138, fontSize: 15, color: '#D4AF37', fontWeight: 'normal', height: 40 }),
      buttonEl({ id: 'seed-btn', label: 'Discover', y: 280, backgroundColor: '#D4AF37', textColor: '#0B0B0D' }),
    ],
  },
  {
    id: 'luxury-coastal',
    name: 'Coastal Estate',
    tier: 'luxury',
    price: 189,
    description: 'Airy, high-end look with soft neutrals and serif-style headlines.',
    swatch: ['#F5F1EA', '#B8A88A'],
    background: '#FBF9F5',
    accent: '#8A7A5C',
    textColor: '#2B2620',
    seedElements: [
      shapeEl({ id: 'seed-block', y: 0, color: '#EFE9DC', height: 240 }),
      textEl({ id: 'seed-h1', text: 'Effortless Elegance', y: 90, fontSize: 28, color: '#2B2620' }),
      textEl({ id: 'seed-sub', text: 'Where every detail feels considered.', y: 136, fontSize: 15, color: '#6B5F49', fontWeight: 'normal', height: 40 }),
      buttonEl({ id: 'seed-btn', label: 'View More', y: 260, backgroundColor: '#8A7A5C' }),
    ],
  },
  {
    id: 'crazy-neon',
    name: 'Neon Overdrive',
    tier: 'luxury-crazy',
    price: 399,
    description: 'Maximalist neon gradients, motion-ready blocks, and statement type.',
    swatch: ['#FF00E5', '#00F0FF'],
    background: '#0A0014',
    accent: '#00F0FF',
    textColor: '#FFFFFF',
    seedElements: [
      shapeEl({ id: 'seed-block-1', y: 0, color: '#FF00E5', height: 160 }),
      shapeEl({ id: 'seed-block-2', y: 130, color: '#00F0FF', height: 140 }),
      textEl({ id: 'seed-h1', text: 'GO ALL OUT', y: 200, fontSize: 34, color: '#FFFFFF' }),
      textEl({ id: 'seed-sub', text: 'A site as loud as your brand.', y: 250, fontSize: 15, color: '#00F0FF', fontWeight: 'normal', height: 40 }),
      buttonEl({ id: 'seed-btn', label: 'Enter', y: 310, backgroundColor: '#FF00E5' }),
    ],
  },
  {
    id: 'crazy-editorial',
    name: 'Editorial Maximal',
    tier: 'luxury-crazy',
    price: 399,
    description: 'Magazine-grade layered layout, oversized type, dramatic contrast.',
    swatch: ['#0F0F0F', '#E63946'],
    background: '#0F0F0F',
    accent: '#E63946',
    textColor: '#FFFFFF',
    seedElements: [
      shapeEl({ id: 'seed-block', y: 0, color: '#E63946', height: 90 }),
      textEl({ id: 'seed-h1', text: 'THE STATEMENT ISSUE', y: 110, fontSize: 32, color: '#FFFFFF' }),
      textEl({ id: 'seed-sub', text: 'Bold storytelling for a brand that leads.', y: 160, fontSize: 15, color: '#E63946', fontWeight: 'normal', height: 40 }),
      buttonEl({ id: 'seed-btn', label: 'Read More', y: 300, backgroundColor: '#FFFFFF', textColor: '#0F0F0F' }),
    ],
  },
];

export function getTheme(id: string): Theme {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return THEMES[0];
  return theme;
}
