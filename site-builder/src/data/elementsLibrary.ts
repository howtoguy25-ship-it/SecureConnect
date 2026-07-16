import { CanvasElement } from '@/types';

export type ElementCategory = 'icons' | 'shapes' | 'buttons' | 'flags';

export interface LibraryItem {
  id: string;
  label: string;
  category: ElementCategory;
  preview: { kind: 'icon' | 'shape' | 'emoji'; value: string; color?: string };
  build: (id: string, centerX: number, centerY: number) => CanvasElement;
}

function iconItem(iconName: string, label: string): LibraryItem {
  return {
    id: `icon-${iconName}`,
    label,
    category: 'icons',
    preview: { kind: 'icon', value: iconName, color: '#111827' },
    build: (id, cx, cy) => ({
      id,
      type: 'icon',
      iconSet: 'Ionicons',
      iconName,
      color: '#111827',
      x: cx - 24,
      y: cy - 24,
      width: 48,
      height: 48,
      zIndex: 5,
    }),
  };
}

const ICON_NAMES: [string, string][] = [
  ['heart', 'Heart'],
  ['star', 'Star'],
  ['home', 'Home'],
  ['cart', 'Cart'],
  ['mail', 'Mail'],
  ['call', 'Call'],
  ['camera', 'Camera'],
  ['location', 'Location'],
  ['calendar', 'Calendar'],
  ['chatbubble-ellipses', 'Chat'],
  ['thumbs-up', 'Thumbs Up'],
  ['gift', 'Gift'],
  ['rocket', 'Rocket'],
  ['briefcase', 'Briefcase'],
  ['globe', 'Globe'],
  ['lock-closed', 'Lock'],
  ['checkmark-circle', 'Check'],
  ['close-circle', 'Close'],
  ['add-circle', 'Add'],
  ['information-circle', 'Info'],
  ['warning', 'Warning'],
  ['musical-notes', 'Music'],
  ['play-circle', 'Play'],
  ['pause-circle', 'Pause'],
  ['share-social', 'Share'],
  ['person', 'Person'],
  ['people', 'People'],
  ['settings', 'Settings'],
  ['search', 'Search'],
  ['notifications', 'Notification'],
  ['sunny', 'Sunny'],
  ['moon', 'Moon'],
  ['cloud', 'Cloud'],
  ['flame', 'Flame'],
  ['leaf', 'Leaf'],
  ['paw', 'Paw'],
  ['restaurant', 'Restaurant'],
  ['cafe', 'Cafe'],
  ['car', 'Car'],
  ['airplane', 'Airplane'],
  ['bicycle', 'Bicycle'],
  ['football', 'Football'],
  ['trophy', 'Trophy'],
  ['book', 'Book'],
  ['bulb', 'Idea'],
  ['key', 'Key'],
  ['shield-checkmark', 'Shield'],
  ['card', 'Card'],
  ['cash', 'Cash'],
  ['pricetag', 'Price Tag'],
];

const ICONS: LibraryItem[] = ICON_NAMES.map(([name, label]) => iconItem(name, label));

const SHAPES: LibraryItem[] = [
  { kind: 'rectangle', label: 'Rectangle', color: '#94A3B8' },
  { kind: 'rounded-rectangle', label: 'Rounded Rectangle', color: '#60A5FA' },
  { kind: 'circle', label: 'Circle', color: '#34D399' },
  { kind: 'triangle', label: 'Triangle', color: '#FBBF24' },
  { kind: 'line', label: 'Line', color: '#111827' },
  { kind: 'star', label: 'Star', color: '#F472B6' },
].map(({ kind, label, color }) => ({
  id: `shape-${kind}`,
  label,
  category: 'shapes' as const,
  preview: { kind: 'shape' as const, value: kind, color },
  build: (id: string, cx: number, cy: number): CanvasElement => ({
    id,
    type: 'shape',
    shapeKind: kind as any,
    color,
    x: cx - 40,
    y: cy - 40,
    width: 80,
    height: kind === 'line' ? 4 : 80,
    zIndex: 5,
  }),
}));

const BUTTONS: LibraryItem[] = [
  {
    id: 'button-primary',
    label: 'Primary',
    category: 'buttons',
    preview: { kind: 'shape', value: 'rounded-rectangle', color: '#111827' },
    build: (id, cx, cy) => ({
      id,
      type: 'button',
      label: 'Button',
      backgroundColor: '#111827',
      textColor: '#FFFFFF',
      borderRadius: 10,
      x: cx - 80,
      y: cy - 24,
      width: 160,
      height: 48,
      zIndex: 5,
    }),
  },
  {
    id: 'button-outline',
    label: 'Outline',
    category: 'buttons',
    preview: { kind: 'shape', value: 'rounded-rectangle', color: '#FFFFFF' },
    build: (id, cx, cy) => ({
      id,
      type: 'button',
      label: 'Button',
      backgroundColor: 'transparent',
      textColor: '#111827',
      borderRadius: 10,
      borderWidth: 2,
      borderColor: '#111827',
      x: cx - 80,
      y: cy - 24,
      width: 160,
      height: 48,
      zIndex: 5,
    }),
  },
  {
    id: 'button-pill',
    label: 'Pill',
    category: 'buttons',
    preview: { kind: 'shape', value: 'circle', color: '#2563EB' },
    build: (id, cx, cy) => ({
      id,
      type: 'button',
      label: 'Button',
      backgroundColor: '#2563EB',
      textColor: '#FFFFFF',
      borderRadius: 24,
      x: cx - 80,
      y: cy - 24,
      width: 160,
      height: 48,
      zIndex: 5,
    }),
  },
  {
    id: 'button-square',
    label: 'Square',
    category: 'buttons',
    preview: { kind: 'shape', value: 'rectangle', color: '#DC2626' },
    build: (id, cx, cy) => ({
      id,
      type: 'button',
      label: 'Button',
      backgroundColor: '#DC2626',
      textColor: '#FFFFFF',
      borderRadius: 0,
      x: cx - 80,
      y: cy - 24,
      width: 160,
      height: 48,
      zIndex: 5,
    }),
  },
];

const FLAG_EMOJIS: [string, string][] = [
  ['🇺🇸', 'United States'],
  ['🇬🇧', 'United Kingdom'],
  ['🇦🇺', 'Australia'],
  ['🇨🇦', 'Canada'],
  ['🇳🇿', 'New Zealand'],
  ['🇫🇷', 'France'],
  ['🇩🇪', 'Germany'],
  ['🇮🇹', 'Italy'],
  ['🇪🇸', 'Spain'],
  ['🇯🇵', 'Japan'],
  ['🇰🇷', 'South Korea'],
  ['🇨🇳', 'China'],
  ['🇮🇳', 'India'],
  ['🇧🇷', 'Brazil'],
  ['🇲🇽', 'Mexico'],
  ['🇿🇦', 'South Africa'],
  ['🇦🇪', 'UAE'],
  ['🇸🇬', 'Singapore'],
  ['🇳🇱', 'Netherlands'],
  ['🇸🇪', 'Sweden'],
];

const FLAGS: LibraryItem[] = FLAG_EMOJIS.map(([emoji, label]) => ({
  id: `flag-${label.replace(/\s+/g, '-').toLowerCase()}`,
  label,
  category: 'flags' as const,
  preview: { kind: 'emoji' as const, value: emoji },
  build: (id: string, cx: number, cy: number): CanvasElement => ({
    id,
    type: 'text',
    text: emoji,
    x: cx - 24,
    y: cy - 24,
    width: 48,
    height: 48,
    zIndex: 5,
    fontSize: 36,
    color: '#000000',
    fontWeight: 'normal',
    align: 'center',
  }),
}));

export const ELEMENT_LIBRARY: LibraryItem[] = [...ICONS, ...SHAPES, ...BUTTONS, ...FLAGS];

export const ELEMENT_CATEGORIES: { key: ElementCategory; label: string }[] = [
  { key: 'icons', label: 'Icons' },
  { key: 'shapes', label: 'Shapes' },
  { key: 'buttons', label: 'Buttons' },
  { key: 'flags', label: 'Flags' },
];
