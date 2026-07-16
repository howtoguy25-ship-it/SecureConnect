export type PageType = 'website' | 'video' | 'social' | 'logo';

export type ThemeTier = 'blank' | 'free' | 'luxury' | 'luxury-crazy';

export interface Theme {
  id: string;
  name: string;
  tier: ThemeTier;
  price: number; // 0 for blank/free
  description: string;
  swatch: [string, string]; // gradient preview colors
  background: string;
  accent: string;
  textColor: string;
  fontFamily?: string;
  seedElements: CanvasElement[];
}

export type ElementType =
  | 'text'
  | 'image'
  | 'shape'
  | 'button'
  | 'icon'
  | 'slideshow';

interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
}

export interface ImageElement extends BaseElement {
  type: 'image';
  uri: string | null;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeKind: 'rectangle' | 'rounded-rectangle' | 'circle' | 'triangle' | 'line' | 'star';
  color: string;
}

export interface ButtonElement extends BaseElement {
  type: 'button';
  label: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  borderWidth?: number;
  borderColor?: string;
}

export interface IconElement extends BaseElement {
  type: 'icon';
  iconSet: 'Ionicons' | 'MaterialCommunityIcons' | 'FontAwesome5';
  iconName: string;
  color: string;
}

export interface SlideshowElement extends BaseElement {
  type: 'slideshow';
  images: string[];
  autoPlay: boolean;
  intervalMs: number;
}

export type CanvasElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | ButtonElement
  | IconElement
  | SlideshowElement;

export interface AnnouncementBarConfig {
  id: string;
  text: string;
  backgroundColor: string;
  textColor: string;
}

export interface AnnouncementSettings {
  enabled: boolean;
  autoSlide: boolean;
  intervalMs: number;
  bars: AnnouncementBarConfig[]; // max 2
}

export interface CanvasSize {
  width: number;
  height: number;
  label: string;
}

export interface Project {
  id: string;
  name: string;
  pageType: PageType;
  themeId: string;
  canvasSize: CanvasSize;
  backgroundColor: string;
  elements: CanvasElement[];
  announcements: AnnouncementSettings;
  createdAt: number;
  updatedAt: number;
}
