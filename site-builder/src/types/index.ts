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

// A simple two-color linear gradient -- `angle` follows the CSS linear-gradient()
// convention (0deg = bottom-to-top, 90deg = left-to-right, clockwise from there), so the
// same value drives both the editor's RN <LinearGradient> and the published site's real CSS
// with no conversion needed. Optional everywhere it appears; a null/absent value means "use
// the plain solid color field instead" -- gradient never fully replaces the solid field, it
// only overrides it when present.
export interface GradientFill {
  colors: [string, string];
  angle: number;
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
  | 'product'
  | 'collection'
  | 'game';

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
  // Overrides backgroundColor when set -- see GradientFill's comment.
  backgroundGradient?: GradientFill | null;
  textColor: string;
  borderRadius: number;
  borderWidth?: number;
  borderColor?: string;
  // Where a tap on the published site actually goes -- a full URL (https://...), a
  // mailto:/tel: link, or a same-site page slug (e.g. "/about"). Null/empty means the
  // button renders but does nothing when clicked, same as before this field existed.
  // Mutually exclusive with linkTargetElementId -- setting one clears the other.
  link?: string | null;
  // Instead of a raw URL, jump straight to a Product or Collection element already on this
  // page (e.g. a "Shop Now" button scrolling down to a specific listing) -- holds that
  // element's id. Published as a same-page anchor link (see id="el-{id}" in siteHtml.ts),
  // so it always points at that element's current position, even after reordering.
  linkTargetElementId?: string | null;
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

// One buyer-facing choice axis, e.g. { name: "Size", values: ["S","M","L"] }. An empty
// variantOptions array on ProductElement means "no variants" (simple product) -- same
// empty-array-means-off convention as questions/memorySymbols on GameElement.
export interface ProductVariantOption {
  name: string;
  values: string[];
}

// One specific combination across every option, e.g. Size "M" + Color "Red" -- generated
// as the full cross-product of variantOptions whenever options/values change, so there's
// always exactly one ProductVariant per real buyable combination.
export interface ProductVariant {
  // Stable across regeneration as long as the same option values still exist (built from
  // the option values themselves, e.g. "M|Red") -- this is what ties a variant's own stock
  // count to a specific real-world combination across edits/republishes, the same way
  // productId ties a whole ProductElement to its inventory doc.
  key: string;
  optionValues: string[]; // parallel to variantOptions, e.g. ["M", "Red"]
  // Null = use the product's own priceUsd -- most sellers don't need per-variant pricing.
  priceUsd: number | null;
  // Only used to *initialize* this variant's stock the first time it's published -- same
  // never-overwritten-by-republish rule as ProductElement.initialStock.
  initialStock: number | null;
  sku: string | null;
}

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
  // A crossed-out "was" price shown next to priceUsd on the published site (e.g. "$59
  // ~~$79~~") -- purely a marketing display, never affects what's actually charged at
  // checkout. Null/0 means don't show one.
  compareAtPriceUsd: number | null;
  // What this item actually costs the seller to acquire/make -- shown only to the seller in
  // the editor, for their own margin tracking. Never rendered anywhere on the published
  // site or exposed to a buyer.
  costUsd: number | null;
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
  variantOptions: ProductVariantOption[]; // empty = simple product, no variant picker
  variants: ProductVariant[]; // one per real combination across variantOptions
}

// Groups 2+ existing Product elements from the same page under one named, browsable card --
// e.g. "Summer Collection" bundling several products a seller already built individually.
// Deliberately holds no product data of its own (name/price/images/stock): `productIds`
// points at the real ProductElement.id values on the same page, so a collection always shows
// each product's current, live info (and buys through that exact same product card/checkout
// path) instead of a copy that could drift out of sync.
export interface CollectionElement extends BaseElement {
  type: 'collection';
  name: string;
  productIds: string[];
}

export type GameKind = 'trivia' | 'memory' | 'tictactoe' | 'clicker' | 'connect4' | 'rps' | 'flappy' | 'tetris' | 'simon' | 'targetrange3d';

export interface TriviaQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

// A real, playable mini-game -- not a screenshot or a mockup. One element type covers every
// kind rather than a discriminated union per kind, matching ProductElement's pattern (fields
// only meaningful for one saleType); here, only the fields relevant to `kind` are ever read.
// 'tictactoe' needs none of the data fields at all -- it's pure, self-contained game logic.
export interface GameElement extends BaseElement {
  type: 'game';
  kind: GameKind;
  title: string;
  // Only meaningful for kind === 'trivia'.
  questions: TriviaQuestion[];
  // Only meaningful for kind === 'memory' -- each entry is one symbol shown on exactly 2
  // cards (its matching pair) -- plain short text/emoji so the game needs no image assets.
  memorySymbols: string[];
  // Only meaningful for kind === 'clicker'.
  clickerLabel: string;
  clickerTarget: number;
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
  | ProductElement
  | CollectionElement
  | GameElement;

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

// A single formatted span of text within a policy's body. `link` (a real https://, mailto:,
// or tel: target) makes this run render as a real, underlined, clickable link in both the
// editor and the published site -- "insert a link and it becomes a working clickable link
// once saved" -- rather than a separate hyperlink widget bolted on top of plain text.
export interface RichTextRun {
  text: string;
  bold?: boolean;
  underline?: boolean;
  color?: string | null;
  link?: string | null;
}

export type PolicyKind = 'privacy' | 'terms' | 'shipping' | 'refund' | 'contact' | 'custom';

// A real, publishable page a site owner writes once and can link to from buttons, the
// automatic footer bar, or the site menu -- e.g. a Privacy Policy or a custom "Our Story"
// page. `paragraphs` is a list of paragraphs, each itself a list of RichTextRun spans, so one
// paragraph can mix plain, bold, and linked text. `title` is what shows on the footer
// button/page (independent of `kind`, so "Refund/Return" can be renamed to "Returns &
// Exchanges" without losing what it actually is).
export interface PolicyDoc {
  id: string;
  kind: PolicyKind;
  title: string;
  paragraphs: RichTextRun[][];
  updatedAt: number;
}

// Where a tap on a menu item goes -- another page of the same site, a policy page, or a
// plain external URL/mailto/tel, mirroring the same three targets a button can already link
// to (see ButtonElement's link/linkTargetElementId).
export type MenuItemTarget =
  | { type: 'page'; pageId: string }
  | { type: 'policy'; policyId: string }
  | { type: 'url'; url: string };

export interface MenuItem {
  id: string;
  label: string;
  target: MenuItemTarget;
}

// The real hamburger (three-line) menu automatically shown at the top of every published
// page. `enabled` lets a site owner turn it off entirely rather than show an empty menu.
export interface SiteMenu {
  enabled: boolean;
  items: MenuItem[];
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
  // Overrides backgroundColor when set -- see GradientFill's comment.
  backgroundGradient?: GradientFill | null;
}

export interface Project {
  id: string;
  name: string;
  pageType: PageType;
  themeId: string;
  canvasSize: CanvasSize;
  backgroundColor: string;
  // Overrides backgroundColor when set -- see GradientFill's comment.
  backgroundGradient?: GradientFill | null;
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
  // Optional -- absent/undefined means "none created yet" for every project made before this
  // feature existed, same treatment as `pages`. Shared across every page of the site (not
  // per-page), since a Privacy Policy or site menu is a whole-site concern, not a per-page one.
  policies?: PolicyDoc[];
  menu?: SiteMenu;
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
  country?: string;
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
  // Which specific variant combination was bought (e.g. key "M|Red", label "Size: M, Color:
  // Red") -- both null for a simple product with no variants.
  variantKey: string | null;
  variantLabel: string | null;
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
