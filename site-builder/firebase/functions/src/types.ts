// Mirrors the app's src/types/index.ts element/project shapes. Cloud Functions run in a
// separate Node/TypeScript project from the Expo app (different build toolchain, can't
// share a `@/` path alias across them), so these are duplicated rather than imported --
// keep in sync by hand if either side's schema changes.

export type PageType = 'website' | 'video' | 'social' | 'logo';

export type ElementType = 'text' | 'image' | 'shape' | 'button' | 'icon' | 'slideshow' | 'video';

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

export interface VideoElement extends BaseElement {
  type: 'video';
  uri: string | null;
  trimStartMs: number;
  trimEndMs: number | null;
  muted: boolean;
  loop: boolean;
  audioUri: string | null;
  audioVolume: number;
}

export type CanvasElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | ButtonElement
  | IconElement
  | SlideshowElement
  | VideoElement;

export interface CanvasSize {
  width: number;
  height: number;
  label: string;
}

export interface AnnouncementSettings {
  enabled: boolean;
  autoSlide: boolean;
  intervalMs: number;
  bars: { id: string; text: string; backgroundColor: string; textColor: string }[];
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
  publishSlug?: string | null;
  publishedAt?: number | null;
  customDomain?: string | null;
  domainStatus?: 'pending' | 'active' | 'failed' | null;
}

// A published project's rendered output, looked up by slug (or by custom domain hostname
// via domainMappings) when serving public traffic -- see servePublishedSite in index.ts.
export interface PublishedSite {
  uid: string;
  projectId: string;
  html: string;
  updatedAt: number;
}

export type DomainPurchaseStatus = 'pending' | 'paid' | 'registering' | 'registered' | 'failed';

// Real-world registrant contact required by ICANN for every domain registration --
// WHOIS privacy (WhoisGuard) hides it publicly, but the registrar still needs the real
// owner's details on file.
export interface RegistrantContact {
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  phone: string;
  emailAddress: string;
}

export interface DomainPurchase {
  id: string;
  uid: string;
  projectId: string | null;
  domain: string;
  years: number;
  priceUsd: number;
  namecheapChargedUsd: number | null;
  stripeSessionId: string | null;
  status: DomainPurchaseStatus;
  registrant: RegistrantContact;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

// Inbound domain transfer -- bringing a domain the user already owns at a different
// registrar into this Namecheap account. Not charged via Stripe (see ROADMAP Phase 7c
// scoping note) -- costs are absorbed on the product's own Namecheap balance for now.
export interface DomainTransfer {
  id: string;
  uid: string;
  domain: string;
  transferId: string;
  status: string;
  statusDescription: string;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export type GenerationStatus =
  | 'starting'
  | 'generating'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface GenerationSession {
  id: string;
  uid: string;
  prompt: string;
  pageType: PageType;
  complexity: 'simple' | 'standard' | 'crazy';
  status: GenerationStatus;
  statusMessage: string;
  minutesElapsed: number;
  creditsUsed: number;
  pausesUsed: number;
  pauseRequested: boolean;
  resumeRequested: boolean;
  injectedMessage: string | null;
  resultProjectId: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export type PlanId = 'free' | 'beginner' | 'middle' | 'advanced';

export interface UserAccount {
  uid: string;
  credits: number;
  plan: PlanId;
  planRenewsAt: number | null;
  createdAt: number;
}
