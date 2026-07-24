// Mirrors the app's src/types/index.ts element/project shapes. Cloud Functions run in a
// separate Node/TypeScript project from the Expo app (different build toolchain, can't
// share a `@/` path alias across them), so these are duplicated rather than imported --
// keep in sync by hand if either side's schema changes.

export type PageType = 'website' | 'video' | 'social' | 'logo';

export type ElementType = 'text' | 'image' | 'shape' | 'button' | 'icon' | 'slideshow' | 'video' | 'videoEmbed' | 'product' | 'collection' | 'game' | 'widget' | 'customWidget';

// Mirrors the client's GradientFill -- `angle` is the CSS linear-gradient() angle (0deg =
// bottom-to-top, 90deg = left-to-right), so siteHtml.ts can drop it straight into real CSS.
export interface GradientFill {
  colors: [string, string];
  angle: number;
}

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
  backgroundGradient?: GradientFill | null;
  textColor: string;
  borderRadius: number;
  borderWidth?: number;
  borderColor?: string;
  link?: string | null;
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
  trimEndMs: number | null;
  muted: boolean;
  loop: boolean;
  audioUri: string | null;
  audioVolume: number;
}

// A real video found on the open web (currently YouTube), not one the user uploaded --
// see the client-side VideoEmbedElement's comment in src/types/index.ts for why this is
// its own type instead of reusing VideoElement's uri field.
export interface VideoEmbedElement extends BaseElement {
  type: 'videoEmbed';
  provider: 'youtube';
  videoId: string;
  title: string;
}

// 'product': a physical (or shippable/holdable) good -- fulfillment says how the buyer
// gets it. 'service': a real-life, in-person service (a car wash, a haircut, a table) --
// booked for a specific date/time instead of shipped, and paid for as one real one-time
// reservation charge (never a recurring/subscription charge) -- see createStoreCheckout's
// booking handling in index.ts. 'digital': a downloadable/electronically-delivered good --
// no shipping and no booking; the seller sends the file/link on manually after the existing
// order-notification email, so checkout treats it like a 'product' with no fulfillment step.
export type ProductSaleType = 'product' | 'service' | 'digital' | 'custom';
export type ProductFulfillment = 'pickup' | 'delivery' | 'both';

// Mirrors the client's ProductVariantOption/ProductVariant -- see that file's comments for
// the full rationale (key stability, price/stock override semantics).
export interface ProductVariantOption {
  name: string;
  values: string[];
}

export interface ProductVariant {
  key: string;
  optionValues: string[];
  priceUsd: number | null;
  initialStock: number | null;
  sku: string | null;
}

// Mirrors the client's CatalogProduct -- the account-level Products catalog
// (users/{uid}/products/{id}), independent of any one project/page.
export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  compareAtPriceUsd: number | null;
  costUsd: number | null;
  images: string[];
  trackInventory: boolean;
  initialStock: number | null;
  inStock: boolean;
  saleType: ProductSaleType;
  fulfillment: ProductFulfillment;
  serviceDurationMinutes: number | null;
  variantOptions: ProductVariantOption[];
  variants: ProductVariant[];
  createdAt: number;
  updatedAt: number;
}

// A sellable product block -- owns no product data of its own: `productId` references a real
// CatalogProduct (users/{uid}/products), resolved live wherever it's needed (publish-time
// snapshot, checkout, storeInventory sync). See the client's ProductElement comment for the
// full rationale and the backward-compat fallback for elements stored before this change.
export interface ProductElement extends BaseElement {
  type: 'product';
  productId: string;
  nameFontFamily?: string;
  nameFontSize?: number;
  priceFontFamily?: string;
  priceFontSize?: number;
}

// Mirrors the client's CollectionElement -- see that file's comment for why productIds
// points at sibling ProductElement.id values instead of embedding a copy of their data.
export interface CollectionElement extends BaseElement {
  type: 'collection';
  name: string;
  productIds: string[];
  nameFontFamily?: string;
  nameFontSize?: number;
  priceFontFamily?: string;
  priceFontSize?: number;
}

// Mirrors the client's CatalogCollection -- the account-level Collections catalog
// (users/{uid}/collections/{id}), independent of any one project/page.
export interface CatalogCollection {
  id: string;
  name: string;
  description: string;
  coverImage: string | null;
  productIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type GameKind = 'trivia' | 'memory' | 'tictactoe' | 'clicker' | 'connect4' | 'rps' | 'flappy' | 'tetris' | 'simon' | 'targetrange3d' | 'basketball';

export interface TriviaQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

// Mirrors the client's GameElement -- see that file's comment for why one type covers every
// kind instead of a discriminated union.
export interface GameElement extends BaseElement {
  type: 'game';
  kind: GameKind;
  title: string;
  questions: TriviaQuestion[];
  memorySymbols: string[];
  clickerLabel: string;
  clickerTarget: number;
}

// Every kind is a real, always-live/interactive utility, never a static picture standing
// in for one -- same flat-interface convention as GameElement covering every game kind.
export type WidgetKind = 'clock' | 'countdown' | 'stopwatch' | 'calculator' | 'unitconverter';

export interface WidgetTimezone {
  label: string; // user-facing name, e.g. "New York" or "Tokyo Office"
  ianaTimezone: string; // a real IANA zone id, e.g. "America/New_York" -- never invented
}

// Mirrors the client's WidgetElement. `timezones` is only meaningful for kind 'clock' (one
// entry renders a simple local clock, 2+ renders a real world clock, each tick computed live
// via Intl.DateTimeFormat, never a static render). `countdownTargetIso`/`countdownLabel` are
// only for kind 'countdown' -- a real ISO timestamp it counts down to live, client-side.
// 'stopwatch'/'calculator'/'unitconverter' need no extra fields -- purely interactive, built
// entirely client-side -- see renderWidgetHtml in siteHtml.ts for the published-site
// implementation of every kind.
export interface WidgetElement extends BaseElement {
  type: 'widget';
  kind: WidgetKind;
  title: string;
  timezones: WidgetTimezone[];
  style: 'analog' | 'digital';
  countdownTargetIso: string;
  countdownLabel: string;
}

// A real, AI-generated interactive mini-app for whatever a user asks for that doesn't fit
// any other real element kind (product/game/widget/video/etc.) -- `code` is a complete,
// self-contained HTML document (inline <style>/<script>, real generated <img> URLs already
// substituted in, no external placeholders) that runs the actual thing, not a description of
// it. Rendered inside a sandboxed iframe (see renderCustomWidgetHtml in siteHtml.ts) so
// whatever it does stays contained to itself -- no access to the rest of the page, its cart,
// or cookies. `generating`/`error` track an in-progress or failed generation (manual "Generate"
// path in the editor); a freshly-added element starts with empty `code` and `generating: false`.
export interface CustomWidgetElement extends BaseElement {
  type: 'customWidget';
  title: string;
  description: string;
  code: string;
  generating?: boolean;
  error?: string | null;
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
  | GameElement
  | WidgetElement
  | CustomWidgetElement;

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

// Mirrors src/types/index.ts's RichTextRun/PolicyDoc/MenuItemTarget/MenuItem/SiteMenu -- see
// that file's comments for why this is duplicated instead of shared.
export interface RichTextRun {
  text: string;
  bold?: boolean;
  underline?: boolean;
  color?: string | null;
  link?: string | null;
}

export type PolicyKind = 'privacy' | 'terms' | 'shipping' | 'refund' | 'contact' | 'custom';

export interface PolicyDoc {
  id: string;
  kind: PolicyKind;
  title: string;
  paragraphs: RichTextRun[][];
  updatedAt: number;
}

export type MenuItemTarget =
  | { type: 'page'; pageId: string }
  | { type: 'policy'; policyId: string }
  | { type: 'url'; url: string }
  | { type: 'product'; productId: string }
  | { type: 'collection'; elementId: string };

export interface MenuItem {
  id: string;
  label: string;
  target: MenuItemTarget;
}

export interface SiteMenu {
  enabled: boolean;
  items: MenuItem[];
}

// Mirrors src/types/index.ts's SitePage -- see that file's comment for why this is
// duplicated instead of shared (separate Node project, can't import from the client).
export interface SitePage {
  id: string;
  name: string;
  slug: string;
  elements: CanvasElement[];
  backgroundColor: string;
  backgroundGradient?: GradientFill | null;
}

export interface Project {
  id: string;
  name: string;
  pageType: PageType;
  themeId: string;
  canvasSize: CanvasSize;
  backgroundColor: string;
  backgroundGradient?: GradientFill | null;
  elements: CanvasElement[];
  pages?: SitePage[];
  announcements: AnnouncementSettings;
  createdAt: number;
  updatedAt: number;
  publishSlug?: string | null;
  publishedAt?: number | null;
  customDomain?: string | null;
  domainStatus?: 'pending' | 'active' | 'failed' | null;
  policies?: PolicyDoc[];
  menu?: SiteMenu;
  // Real site header chrome (hamburger + logo/name + search/cart) -- rendered automatically
  // for every published site (AI-built or manual), see renderHeaderBarHtml in siteHtml.ts.
  // No on/off flag: like the policy footer and announcement bar, this is always-on chrome,
  // just configurable. logoUrl absent/null falls back to the site name as plain text.
  logoUrl?: string | null;
  logoHeightPx?: number; // default 32
  logoFit?: 'contain' | 'cover'; // default 'contain'
  headerDividerColor?: string; // default '#E2E8F0'
}

// A published project's rendered output, looked up by slug (or by custom domain hostname
// via domainMappings) when serving public traffic -- see servePublishedSite in index.ts.
export interface PublishedSite {
  uid: string;
  projectId: string;
  // Legacy/single-page projects (Social, Logo, Video, AI-generated sites, and any Website
  // built before multi-page existed) store their one rendered page here.
  html: string;
  // Multi-page manually-built websites store every page here instead, keyed by that page's
  // `slug` ('' for Home) -- see publishProject/servePublishedSite in index.ts.
  pages?: Record<string, string>;
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
  // Set the first time this account pays for a web (Stripe) subscription -- lets
  // createStripeBillingPortalSession send them to a real self-service "manage/cancel
  // subscription" page without SiteSpark building one itself.
  stripeCustomerId?: string | null;
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
  // The ISO 3166-1 alpha-2 country the Stripe Express account was created with -- Stripe
  // fixes this at account creation and never lets it change afterward, so it's kept here
  // purely so a broken/mismatched account (created before this field existed, or from a
  // seller whose device region was wrong) can be recognized and reset rather than silently
  // reused with the wrong country forever.
  country?: string;
  onboardingStatus: 'not_connected' | 'pending' | 'active';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  // A flat USD fee added at checkout whenever the cart needs real shipping (a physical,
  // non-pickup product) -- null/0 means no shipping fee is charged. Set via setShippingFee,
  // never client-written directly (see firestore.rules), same as the rest of this doc.
  shippingFeeUsd?: number | null;
  // Which real currency (lowercase ISO 4217 code, e.g. "usd"/"eur"/"gbp") every *Usd price
  // field on this seller's products/orders is actually denominated in and charged through
  // Stripe as -- see currency.ts. Undefined (never set) means "usd", same as every seller
  // account created before currency selection existed. Set via setCurrency.
  currency?: string;
  createdAt: number;
  updatedAt: number;
}

// Real-time, server-only snapshot of a published project's sellable products, keyed by
// slug -- the authoritative source createStoreCheckout validates price/stock against
// (never the static HTML a buyer's browser already loaded, which could be stale or
// tampered with). Synced from a project's ProductElements on every publishProject call,
// except stockQuantity, which republishing never overwrites once the doc exists -- only a
// real order (decrementing it) or the seller editing it directly changes it after that.
// Mirrors ProductVariant, but stockQuantity replaces initialStock -- same
// never-overwritten-by-republish rule as the top-level StoreInventoryItem.stockQuantity.
export interface StoreInventoryVariant {
  key: string;
  optionValues: string[];
  priceUsd: number | null;
  stockQuantity: number | null;
  sku: string | null;
}

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
  // Manual "pause selling" switch, independent of stockQuantity -- lets a seller instantly
  // hide/disable buying (e.g. temporarily out of raw materials) without resetting or losing
  // their tracked count. Always defaults true; only ever false if a seller explicitly flips
  // it via updateProductStock.
  inStock: boolean;
  saleType: ProductSaleType;
  fulfillment: ProductFulfillment;
  serviceDurationMinutes: number | null;
  variantOptions: ProductVariantOption[];
  variants: StoreInventoryVariant[];
  updatedAt: number;
}

export interface StoreOrderItem {
  productId: string;
  name: string;
  priceUsd: number;
  quantity: number;
  saleType: ProductSaleType;
  // Which specific combination was bought, e.g. key "M|Red" with a human-readable label
  // "Size: M, Color: Red" for display in the seller's Orders screen and order emails. Both
  // null for a simple product with no variants.
  variantKey: string | null;
  variantLabel: string | null;
}

export type StoreOrderStatus = 'paid' | 'refunded';

// Separate from StoreOrderStatus (payment state) -- this tracks physical/logical fulfillment
// of what was paid for. Every order starts 'unfulfilled' regardless of saleType; sellers of
// physical products typically move it through shipped -> delivered, while pickup/digital/
// service orders might jump straight to 'delivered' once handed over/downloaded/completed.
export type FulfillmentStatus = 'unfulfilled' | 'shipped' | 'delivered' | 'cancelled';

export type DiscountType = 'percent' | 'fixed';

// What the code discounts. 'order' (the original/default) takes a percent or fixed amount
// off the whole product subtotal. 'item' takes it off one named product's line total only.
// 'bogo' ("buy X get Y free") ignores type/amount entirely -- see bogoBuyQuantity/
// bogoGetQuantity. 'shipping' takes a percent or fixed amount off the seller's own flat
// shipping fee (see SellerAccount.shippingFeeUsd) instead of anything product-related.
export type DiscountKind = 'order' | 'item' | 'bogo' | 'shipping';

// A seller-created promo code -- stored at users/{sellerUid}/discountCodes/{code} with the
// uppercased code itself as the doc id, so checkout can look one up with a single get (no
// query) once it's resolved a slug to a sellerUid via the publishedSites doc. Only ever
// created/edited through callables (createDiscountCode/setDiscountCodeActive/
// setDiscountCodeAnnouncement/deleteDiscountCode), never client-writable -- see
// firestore.rules -- since redemptionCount has to be trustworthy (it's what enforces
// maxRedemptions) and a seller changing their own redemption count client-side could let a
// code be reused past its real limit.
export interface DiscountCode {
  code: string;
  sellerUid: string;
  kind: DiscountKind;
  // Percent off (1-100) for type 'percent', or a flat USD amount off for type 'fixed'.
  // Ignored for kind 'bogo' (always stored as percent/100 by convention, unused).
  type: DiscountType;
  amount: number;
  // The exact product name (as typed in the editor) this applies to -- required for kinds
  // 'item' and 'bogo', null for 'order'/'shipping'. Matched case-insensitively against the
  // real cart line items at redemption time, so no separate product-id lookup is needed.
  targetProductName: string | null;
  // 'bogo' only: for every (bogoBuyQuantity + bogoGetQuantity) units of targetProductName in
  // the cart, bogoGetQuantity of them are free -- e.g. buy 2 get 1 free repeats every 3 units.
  bogoBuyQuantity: number | null;
  bogoGetQuantity: number | null;
  active: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: number | null; // epoch ms, null = usable immediately
  expiresAt: number | null; // epoch ms, null = never expires
  // Whether a real banner announcing this code should show on the published site. When
  // true, announceDurationMs must be set and announcedAt is stamped (and re-stamped each
  // time the seller re-activates the announcement), anchoring the display window that
  // getActiveDiscountAnnouncement checks.
  announceOnSite: boolean;
  announceDurationMs: number | null;
  announcedAt: number | null;
  createdAt: number;
}

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
  // Lowercased/trimmed copy of buyerEmail, kept in sync at write time -- lets
  // getOrdersByEmail match on a single indexed field regardless of how the buyer typed
  // their email at checkout vs. when looking their order up later.
  buyerEmailLower: string | null;
  buyerName: string | null;
  items: StoreOrderItem[];
  subtotalUsd: number;
  shippingFeeUsd: number;
  // The real currency every *Usd amount on this order was actually charged in -- copied from
  // the seller's SellerAccount.currency at the moment of checkout, so it stays historically
  // accurate even if the seller changes their currency setting later.
  currency: string;
  discountCode: string | null;
  discountAmountUsd: number;
  platformFeeUsd: number;
  sellerNetUsd: number;
  stripeSessionId: string;
  status: StoreOrderStatus;
  bookingDetails: BookingDetails | null;
  fulfillmentStatus: FulfillmentStatus;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingUpdatedAt: number | null;
  createdAt: number;
}
