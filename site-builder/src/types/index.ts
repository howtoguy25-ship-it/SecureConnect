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
  | 'slideshow'
  | 'video'
  | 'videoEmbed'
  | 'product';

interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  locked?: boolean; // when true, stays put in the canvas -- no drag, resize, or pinch
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
  fontFamily?: string; // FontOption id from src/data/fonts.ts -- undefined/'system' = platform default
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
  // Where a tap on the published site actually goes -- a full URL (https://...), a
  // mailto:/tel: link, or a same-site page slug (e.g. "/about"). Null/empty means the
  // button renders but does nothing when clicked, same as before this field existed.
  link?: string | null;
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
  trimEndMs: number | null; // null = play to the natural end
  muted: boolean; // mute the clip's own audio -- useful when overlaying audioUri instead
  loop: boolean;
  audioUri: string | null; // optional second clip used only for its audio track (overlay/replace)
  audioVolume: number; // 0-1, only relevant when audioUri is set
}

// A real, existing video found on the open web (currently YouTube) rather than a clip the
// user recorded/uploaded themselves -- e.g. the AI Site Builder finding real basketball
// highlight/news videos for a sports page. Unlike VideoElement's locally-hosted uri, this
// only ever stores an id pointing at the provider's own hosting, played back via that
// provider's embed player (a WebView in the editor/live preview, a real <iframe> once
// published) -- never downloaded or re-hosted, which the provider's terms don't allow.
export interface VideoEmbedElement extends BaseElement {
  type: 'videoEmbed';
  provider: 'youtube';
  videoId: string;
  title: string;
}

// 'product': a physical (or shippable/holdable) good -- fulfillment says how the buyer
// gets it. 'service': a real-life, in-person service (a car wash, a haircut, a table) --
// booked for a specific date/time instead of shipped, and paid for as one real one-time
// reservation charge (never a recurring/subscription charge). 'digital': a downloadable or
// electronically-delivered good (an ebook, a preset pack, a license key) -- no shipping and
// no booking, so it skips both the fulfillment and service-duration fields. Delivery of the
// actual file/link to the buyer piggybacks on the existing order-notification email (the
// seller sends it on from there) rather than automated hosting/download-link generation.
export type ProductSaleType = 'product' | 'service' | 'digital';
export type ProductFulfillment = 'pickup' | 'delivery' | 'both';

// A sellable product block -- positioned/resized like any other canvas element, and also
// mirrored server-side into a StoreInventoryItem at publish time (see storeInventory in
// firebase/functions), since checkout validates price/stock authoritatively there, not
// against whatever the client last rendered.
export interface ProductElement extends BaseElement {
  type: 'product';
  productId: string; // stable across republishes -- ties this element to its inventory doc
  name: string;
  description: string;
  priceUsd: number;
  images: string[];
  trackInventory: boolean;
  // Only used to *initialize* stockQuantity the first time this product is published --
  // after that, republishing never overwrites stock, only real orders/direct edits do.
  // For a 'service', this doubles as a cap on how many bookings will be accepted (no real
  // calendar/time-slot conflict checking is built).
  initialStock: number | null;
  // Manual "pause selling" switch, independent of stock count -- lets a seller instantly
  // hide/disable buying without resetting their tracked quantity. Defaults true.
  inStock: boolean;
  saleType: ProductSaleType;
  fulfillment: ProductFulfillment; // only meaningful when saleType === 'product'
  serviceDurationMinutes: number | null; // only meaningful when saleType === 'service'
}

export type CanvasElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | ButtonElement
  | IconElement
  | SlideshowElement
  | VideoElement
  | VideoEmbedElement
  | ProductElement;

export interface AnnouncementBarConfig {
  id: string;
  text: string;
  backgroundColor: string;
  textColor: string;
}

// An on-screen popup card (distinct from the top bar) -- shows itself a set number of
// seconds after a visitor lands on the published page, optionally with a CTA button, and
// either stays until dismissed or auto-hides after a set duration. `opacity` only applies to
// the card's background (rgba), never the text/button, so it can read as "transparent" and
// still stay legible.
export interface PopupAnnouncementConfig {
  id: string;
  text: string;
  buttonLabel: string; // '' = no button
  buttonUrl: string;
  backgroundColor: string;
  textColor: string;
  opacity: number; // 0-1
  delaySeconds: number; // shows this long after the page loads
  durationSeconds: number; // 0 = stays until the visitor dismisses it
}

export interface AnnouncementSettings {
  enabled: boolean;
  autoSlide: boolean;
  intervalMs: number;
  bars: AnnouncementBarConfig[]; // max 2
  popups: PopupAnnouncementConfig[]; // max 2
}

export interface CanvasSize {
  width: number;
  height: number;
  label: string;
}

// One page of a multi-page website (Home, About, Contact, ...). Only ever used when
// pageType === 'website' -- Social/Logo/Video stay single-page/fixed-card, they're not
// meant to have connected sub-pages. `slug` is the URL segment other pages link to it by
// ('' for Home); kept distinct from `name` (the editable display label) so renaming a page
// doesn't silently break links other pages already point at it with.
export interface SitePage {
  id: string;
  name: string;
  slug: string;
  elements: CanvasElement[];
  backgroundColor: string;
}

export interface Project {
  id: string;
  name: string;
  pageType: PageType;
  themeId: string;
  canvasSize: CanvasSize;
  backgroundColor: string;
  elements: CanvasElement[];
  // Present only for a manually-built multi-page website (see BuildMethodScreen -> Manual
  // Build). When set, `pages` is the source of truth for content -- the top-level
  // `elements`/`backgroundColor` above are kept mirrored to `pages[0]` (Home) purely so
  // older code that still reads those directly (e.g. ProjectsScreen's thumbnail swatch)
  // keeps working without every call site needing to know about multi-page projects.
  // Every other project (Social/Logo/Video, AI-generated sites, and any site built before
  // this feature existed) has no `pages` and works exactly as before.
  pages?: SitePage[];
  announcements: AnnouncementSettings;
  createdAt: number;
  updatedAt: number;
  publishSlug?: string | null;
  publishedAt?: number | null;
  customDomain?: string | null;
  domainStatus?: 'pending' | 'active' | 'failed' | null;
}

// -- AI Site Builder (Phase 3) --

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
  injectedMessage: string | null;
  // Known from the moment the build starts (unlike resultProjectId, which only means "the
  // build finished") -- lets the client subscribe to the project doc immediately and render
  // a real live preview of elements as the backend writes them incrementally.
  previewProjectId: string;
  resultProjectId: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

// 'active': no known payment problem. 'past_due': the most recent subscription renewal
// failed and the site is still up but a warning banner shows (see BillingBanner.tsx).
// 'suspended': the grace period elapsed with no successful payment and every published site
// on this account has been taken down.
export type BillingStatus = 'active' | 'past_due' | 'suspended';

export interface BillingNotice {
  type: 'payment_failed' | 'suspended' | 'resolved';
  message: string;
  createdAt: number;
}

export interface OrderNotice {
  orderId: string;
  message: string;
  createdAt: number;
}

export interface UserAccount {
  uid: string;
  credits: number;
  plan: 'free' | 'beginner' | 'middle' | 'advanced';
  planRenewsAt: number | null;
  createdAt: number;
  billingStatus?: BillingStatus;
  paymentFailedAt?: number | null;
  billingNotice?: BillingNotice | null;
  lastOrderNotice?: OrderNotice | null;
  lastAdRewardClaimedAt?: number | null;
  // Set the first time this account pays for a web (Stripe) subscription -- lets the
  // "Manage billing" button send them to a real self-service Stripe page.
  stripeCustomerId?: string | null;
}

// -- Storefront: selling products from a published site, with real payouts (Phase 10) --

// One per seller (uid) -- mirrors their real Stripe Express connected account status.
// Money from their store's sales goes directly to this account at checkout time (Stripe's
// application_fee_amount/transfer_data split), never routed through SiteSpark's own
// balance. Read-only client-side; only Cloud Functions ever write it.
export interface SellerAccount {
  uid: string;
  stripeAccountId: string | null;
  onboardingStatus: 'not_connected' | 'pending' | 'active';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StoreOrderItem {
  productId: string;
  name: string;
  priceUsd: number;
  quantity: number;
  saleType: ProductSaleType;
}

export type StoreOrderStatus = 'paid' | 'refunded';

// A real-life service's requested date/time + any special request -- one per checkout
// (not per line item), present only when the order contains at least one 'service' item.
export interface BookingDetails {
  preferredDate: string;
  preferredTime: string;
  notes: string;
}

// One per completed checkout -- the seller's real accounting record, written only by the
// Stripe webhook. A single real one-time payment either way (never a subscription) -- for
// a service, bookingDetails is what makes it a real reservation instead of just a charge.
export interface StoreOrder {
  id: string;
  sellerUid: string;
  slug: string;
  projectId: string;
  buyerEmail: string | null;
  buyerName: string | null;
  items: StoreOrderItem[];
  subtotalUsd: number;
  platformFeeUsd: number;
  sellerNetUsd: number;
  stripeSessionId: string;
  status: StoreOrderStatus;
  bookingDetails: BookingDetails | null;
  createdAt: number;
}

// -- Persistent AI chat assistant (Phase 5) --

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  // Real https:// URLs (already uploaded to Storage) -- e.g. a screenshot of an error the
  // user wants help with. Up to 5 per message.
  images?: string[];
}

export type AssistantActionType =
  | 'navigate'
  | 'startBuildFlow'
  | 'startAIBuild'
  | 'openSubscription'
  | 'openAccount';

export type AssistantNavigateScreen =
  | 'Projects'
  | 'NewProject'
  | 'Subscription'
  | 'Account'
  | 'Support'
  | 'SellerAccount'
  | 'Orders'
  | 'TransferDomain'
  | 'Policy';

export interface AssistantAction {
  type: AssistantActionType;
  screen: AssistantNavigateScreen | null;
  pageType: PageType | null;
  prompt: string | null;
  // Only used when screen is 'Policy'.
  policyType: 'privacy' | 'returns' | null;
}

// -- Buying a new domain (Phase 7b) --

export type DomainPurchaseStatus = 'pending' | 'paid' | 'registering' | 'registered' | 'failed';

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

// -- Transferring a domain in from another registrar (Phase 7c) --

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
