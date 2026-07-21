// Mirrors the app's src/types/index.ts element/project shapes. Cloud Functions run in a
// separate Node/TypeScript project from the Expo app (different build toolchain, can't
// share a `@/` path alias across them), so these are duplicated rather than imported --
// keep in sync by hand if either side's schema changes.

export type PageType = 'website' | 'video' | 'social' | 'logo';

export type ElementType = 'text' | 'image' | 'shape' | 'button' | 'icon' | 'slideshow' | 'video' | 'product';

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
  fontFamily?: string; // FontOption id from the app's src/data/fonts.ts -- undefined/'system' = platform default
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

// 'product': a physical (or shippable/holdable) good -- fulfillment says how the buyer
// gets it. 'service': a real-life, in-person service (a car wash, a haircut, a table) --
// booked for a specific date/time instead of shipped, and paid for as one real one-time
// reservation charge (never a recurring/subscription charge) -- see createStoreCheckout's
// booking handling in index.ts. 'digital': a downloadable/electronically-delivered good --
// no shipping and no booking; the seller sends the file/link on manually after the existing
// order-notification email, so checkout treats it like a 'product' with no fulfillment step.
export type ProductSaleType = 'product' | 'service' | 'digital';
export type ProductFulfillment = 'pickup' | 'delivery' | 'both';

// A sellable product block -- part of the canvas like any other element (positioned,
// resized), but also mirrored server-side into a StoreInventoryItem at publish time (see
// storeInventory in index.ts) since checkout has to validate price/stock authoritatively,
// not trust whatever the client last rendered.
export interface ProductElement extends BaseElement {
  type: 'product';
  productId: string; // stable across republishes -- ties this element to its inventory doc
  name: string;
  description: string;
  priceUsd: number;
  images: string[];
  trackInventory: boolean;
  // Only used to *initialize* the inventory doc's stockQuantity the first time this
  // product is published -- after that, stock is only ever changed by real orders
  // decrementing it (or the seller editing it directly), never overwritten by a republish.
  // For a 'service', this doubles as a cap on how many bookings will be accepted (no real
  // calendar/time-slot conflict checking is built -- see ROADMAP.md Phase 10b scoping note).
  initialStock: number | null;
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
  | ProductElement;

export interface CanvasSize {
  width: number;
  height: number;
  label: string;
}

export interface PopupAnnouncementConfig {
  id: string;
  text: string;
  buttonLabel: string;
  buttonUrl: string;
  backgroundColor: string;
  textColor: string;
  opacity: number;
  delaySeconds: number;
  durationSeconds: number;
}

export interface AnnouncementSettings {
  enabled: boolean;
  autoSlide: boolean;
  intervalMs: number;
  bars: { id: string; text: string; backgroundColor: string; textColor: string }[];
  popups: PopupAnnouncementConfig[];
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
  // Set by enforceBillingSuspensions when the owning account's subscription payment has
  // failed and the grace period has elapsed -- servePublishedSite shows a suspended-site
  // page instead of `html` while this is true, and clears it automatically once the
  // subscription is paid again (see appStoreServerNotifications in index.ts).
  suspended?: boolean;
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
  // Known from the moment the build starts (unlike resultProjectId, which only means "the
  // build finished") -- lets the client subscribe to the project doc immediately and render
  // a real live preview of elements as the backend writes them incrementally.
  previewProjectId: string;
  resultProjectId: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export type PlanId = 'free' | 'beginner' | 'middle' | 'advanced';

// 'active': no known payment problem. 'past_due': the most recent subscription renewal
// failed and paymentFailedAt marks when the grace period started -- the site is still up,
// but a warning banner shows. 'suspended': the grace period elapsed with no successful
// payment, and every published site owned by this account has been taken down.
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
  plan: PlanId;
  planRenewsAt: number | null;
  createdAt: number;
  billingStatus?: BillingStatus;
  paymentFailedAt?: number | null;
  billingNotice?: BillingNotice | null;
  lastOrderNotice?: OrderNotice | null;
  lastAdRewardClaimedAt?: number | null;
}

// -- Storefront: selling products from a published site, with real payouts (Phase 10) --

// One per seller (uid), tracking their real Stripe Express connected account -- money from
// their store's sales is transferred here directly by Stripe at checkout time (via
// application_fee_amount/transfer_data on the PaymentIntent), not routed through
// SiteSpark's own balance first. `chargesEnabled`/`payoutsEnabled` mirror Stripe's own
// account flags (refreshed by getSellerAccountStatus) -- checkout refuses to run for a
// seller whose account isn't charges_enabled yet.
export interface SellerAccount {
  uid: string;
  stripeAccountId: string | null;
  onboardingStatus: 'not_connected' | 'pending' | 'active';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// Real-time, server-only snapshot of a published project's sellable products, keyed by
// slug -- the authoritative source createStoreCheckout validates price/stock against
// (never the static HTML a buyer's browser already loaded, which could be stale or
// tampered with). Synced from a project's ProductElements on every publishProject call,
// except stockQuantity, which republishing never overwrites once the doc exists -- only a
// real order (decrementing it) or the seller editing it directly changes it after that.
export interface StoreInventoryItem {
  productId: string;
  sellerUid: string;
  projectId: string;
  slug: string;
  name: string;
  description: string;
  priceUsd: number;
  images: string[];
  trackInventory: boolean;
  stockQuantity: number | null; // null = not tracked / unlimited
  saleType: ProductSaleType;
  fulfillment: ProductFulfillment;
  serviceDurationMinutes: number | null;
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

// A real-life service's requested date/time + any special request -- collected once per
// checkout (not per line item), since a booking checkout is inherently one reservation
// even if it bundles a couple of add-on services together. Present only when the order
// contains at least one 'service' item.
export interface BookingDetails {
  preferredDate: string;
  preferredTime: string;
  notes: string;
}

// One per completed checkout, written by the Stripe webhook only -- never client-writable,
// since it's also the seller's real accounting record of what they were actually paid. A
// single real one-time payment either way (mode: 'payment', never a subscription) -- for a
// service, bookingDetails is what makes it a real reservation instead of just a charge.
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
