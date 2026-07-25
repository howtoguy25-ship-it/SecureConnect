export type PageType = 'website' | 'video' | 'social' | 'logo';

export type ThemeTier = 'blank' | 'free' | 'luxury' | 'luxury-crazy';

// A style/industry tag for browsing (e.g. "Business", "Restaurant", "Portfolio") --
// independent of tier/pricing, purely for the marketplace's category filter.
export type ThemeCategory =
  | 'Business'
  | 'Portfolio'
  | 'Retail'
  | 'Restaurant'
  | 'Fitness'
  | 'Real Estate'
  | 'Fashion'
  | 'Tech'
  | 'Media'
  | 'Other';

export interface Theme {
  id: string;
  name: string;
  tier: ThemeTier;
  category: ThemeCategory;
  price: number; // 0 for blank/free
  description: string;
  swatch: [string, string]; // gradient preview colors
  background: string;
  accent: string;
  textColor: string;
  fontFamily?: string;
  seedElements: CanvasElement[];
  // Which page type this theme's seedElements are actually laid out for -- a full multi-
  // section site (nav/hero/gallery/footer) only ever makes sense on a scrollable 'website'
  // page, not a single fixed-size Logo/Video/Social card, so ThemeGalleryScreen only offers a
  // theme when this matches (or is left undefined, meaning "every page type" -- used only by
  // the single seedElements-free Blank Page theme, which is trivially safe everywhere).
  pageType?: PageType;
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
  | 'game'
  | 'widget'
  | 'customWidget'
  | 'section';

interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  locked?: boolean; // when true, stays put in the canvas -- no drag, resize, or pinch
  // Degrees clockwise from upright, Canva-style free rotation via the round handle below the
  // selection box. 0/undefined = the element's normal, unrotated orientation. Kept in
  // (-180, 180] -- see normalizeRotationDeg in DraggableElement.tsx.
  rotation?: number;
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

// A real, timed caption line -- shown while playback is between startMs and endMs (clip-
// relative, same clock as trimStartMs/trimEndMs), then hidden. Several can cover the same
// clip end-to-end (a real subtitle track) or leave gaps where nothing shows.
export interface VideoCaption {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface VideoElement extends BaseElement {
  type: 'video';
  uri: string | null;
  trimStartMs: number;
  trimEndMs: number | null; // null = play to the natural end
  muted: boolean; // mute the clip's own audio -- useful when overlaying audioUri instead
  loop: boolean;
  captions?: VideoCaption[];
  // Starts playing on its own instead of waiting for a visitor to tap the play button --
  // browsers (and most native players) only allow this when the clip is also muted, so
  // turning this on forces `muted` on too (see the inspector's own toggle logic).
  autoPlay: boolean;
  // When set, playback -- autoplay or a manual tap -- never goes past trimStartMs +
  // previewSeconds: loops back there if `loop` is on, otherwise pauses. A short preview clip
  // instead of the whole thing, regardless of how it started. null (the default) means the
  // full trimmed range (trimStartMs..trimEndMs) plays out normally.
  previewSeconds: 3 | 5 | 10 | null;
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
export type ProductSaleType = 'product' | 'service' | 'digital' | 'custom';
export type ProductFulfillment = 'pickup' | 'delivery' | 'both';
// Which purchase button(s) the published site shows for this product. 'cart' (default)
// matches every product created before this field existed -- adds to the persistent cart,
// buyer checks out whenever they're ready. 'buyNow' skips the cart entirely and starts a real
// Stripe Checkout session for just this one item immediately. 'both' shows them side by side.
export type BuyButtonMode = 'cart' | 'buyNow' | 'both';

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

// The account-level Products catalog -- a real product a seller owns independent of any one
// project/page, created/edited from ProductsScreen/ProductEditScreen and stored at
// users/{uid}/products/{id}. Every field here is exactly what ProductElement owns today
// except the canvas layout fields (x/y/width/height/zIndex/locked) -- a deliberate 1:1 split
// so a future ProductElement can shrink to a lightweight {productId, layout} reference into
// this catalog (see ProductElement's own comment) without inventing new field semantics.
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
  // Optional -- absent on every product created before this field existed; always read as
  // `product.buyButtonMode ?? 'cart'` so old products keep their exact existing behavior.
  buyButtonMode?: BuyButtonMode;
  createdAt: number;
  updatedAt: number;
}

// A sellable product block -- positioned/resized like any other canvas element, but owns no
// product data of its own: `productId` references a real CatalogProduct (users/{uid}/products),
// resolved live wherever this renders (editor canvas, published site, checkout) -- edit the
// catalog product once, every page/site referencing it updates immediately, no republish
// needed. This is a deliberate architecture change from the element owning its own inline
// name/price/images/etc -- older stored elements may still carry those old inline fields at
// runtime (TypeScript no longer declares them, but nothing has gone back and stripped them),
// which every resolver below falls back to reading if no catalog doc exists yet for that
// productId, so nothing silently breaks for a product that's never been touched since this
// change landed.
export interface ProductElement extends BaseElement {
  type: 'product';
  productId: string;
  // Optional per-element typography override for the name/price text this card renders --
  // undefined means "use the card's normal default styling" (same undefined-is-default
  // convention as TextElement.fontFamily). `*FontFamily` is a FontOption id from
  // src/data/fonts.ts.
  nameFontFamily?: string;
  nameFontSize?: number;
  priceFontFamily?: string;
  priceFontSize?: number;
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
  nameFontFamily?: string;
  nameFontSize?: number;
  priceFontFamily?: string;
  priceFontSize?: number;
}

// A real, selectable "section" band -- e.g. a page's whole "Why Choose Us" area -- rendered
// as a background box behind whichever other elements sit inside it (see `childIds`). Tapping
// directly on a child (a heading, a paragraph) still selects that child as normal, since it
// paints on top of the section at a higher zIndex; tapping anywhere else within the section's
// own bounds selects the section itself, with no special hit-testing needed beyond the
// existing zIndex-ordered rendering every element already uses. Children keep their own
// x/y in the SAME canvas coordinate space as everything else (not section-relative) --
// this is a background band + a membership list, not real nested/relative layout.
export interface SectionElement extends BaseElement {
  type: 'section';
  backgroundColor: string;
  // Overrides backgroundColor when set -- see GradientFill's comment.
  backgroundGradient?: GradientFill | null;
  childIds: string[];
  // Applied to every text element among childIds when set from the section's own inspector,
  // so "change the font/size for this whole section's text" is one action instead of editing
  // each child individually. Undefined leaves each child's own existing font/size alone.
  textFontFamily?: string;
  textFontSize?: number;
}

// The account-level Collections catalog -- a named, reusable group of existing CatalogProducts
// a seller owns independent of any one project/page, created/edited from CollectionEditScreen
// and stored at users/{uid}/collections/{id}. Distinct from CollectionElement above (which
// groups page-local ProductElement siblings on one specific page) -- this is the Products-catalog
// equivalent for collections: manage once from Account, browse/insert from any site.
export interface CatalogCollection {
  id: string;
  name: string;
  description: string;
  coverImage: string | null;
  productIds: string[]; // CatalogProduct ids (users/{uid}/products/{id}), not page-local element ids
  createdAt: number;
  updatedAt: number;
}

export type GameKind = 'trivia' | 'memory' | 'tictactoe' | 'clicker' | 'connect4' | 'rps' | 'flappy' | 'tetris' | 'simon' | 'targetrange3d' | 'basketball';

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

// Every kind is a real, always-live/interactive utility -- never a static image standing in
// for one -- matching GameElement's one-type-covers-every-kind convention.
export type WidgetKind = 'clock' | 'countdown' | 'stopwatch' | 'calculator' | 'unitconverter';

export interface WidgetTimezone {
  label: string; // user-facing name, e.g. "New York" or "Tokyo Office"
  ianaTimezone: string; // a real IANA zone id, e.g. "America/New_York" -- never invented
}

// `timezones` is only meaningful for kind 'clock' (one entry is a simple local clock, 2+ is
// a real world clock, each computed live client-side via Intl.DateTimeFormat, ticking every
// second). `countdownTargetIso`/`countdownLabel` are only for kind 'countdown' -- a real ISO
// timestamp it counts down to live. 'stopwatch'/'calculator'/'unitconverter' need no extra
// fields -- purely interactive, no data beyond what the visitor enters -- see WidgetView.tsx
// (editor) and renderWidgetHtml in firebase/functions/src/siteHtml.ts (published site).
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
// it. Rendered inside a sandboxed WebView (editor, see CustomWidgetView.tsx) or a sandboxed
// iframe (published site, see renderCustomWidgetHtml in firebase/functions/src/siteHtml.ts)
// so whatever it does stays contained to itself -- no access to the rest of the page, its
// cart, or cookies. `generating`/`error` track an in-progress or failed generation (the
// manual "Generate" button in the inspector); a freshly-added element starts with empty
// `code` and `generating: false`.
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
  | CustomWidgetElement
  | SectionElement;

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

// Where a tap on a menu item goes -- another page of the same site, a policy page, a plain
// external URL/mailto/tel, a specific product from the account catalog, or a collection
// already placed somewhere on the site. `product`/`collection` resolve to wherever that
// productId/elementId is actually placed on a page at publish time (see resolveMenuTargetHref
// in siteHtml.ts) -- a product that hasn't been inserted anywhere yet has nothing real to
// link to.
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
  // Real site header chrome (hamburger + logo/name + search/cart) -- rendered automatically
  // for every published site (AI-built or manual), see renderHeaderBarHtml in
  // firebase/functions/src/siteHtml.ts and HeaderBarPreview.tsx for the editor's live match.
  // No on/off flag: like the policy footer and announcement bar, this is always-on chrome,
  // just configurable. logoUrl absent/null falls back to the site name as plain text.
  logoUrl?: string | null;
  logoHeightPx?: number; // default 32
  logoFit?: 'contain' | 'cover'; // default 'contain'
  headerDividerColor?: string; // default '#E2E8F0'
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
  shippingFeeUsd?: number | null;
  currency?: string;
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
  buyerEmailLower: string | null;
  buyerName: string | null;
  items: StoreOrderItem[];
  subtotalUsd: number;
  shippingFeeUsd: number;
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

// Separate from StoreOrderStatus (payment state) -- tracks physical/logical fulfillment of
// what was paid for. Every order starts 'unfulfilled'.
export type FulfillmentStatus = 'unfulfilled' | 'shipped' | 'delivered' | 'cancelled';

export type DiscountType = 'percent' | 'fixed';

export type DiscountKind = 'order' | 'item' | 'bogo' | 'shipping';

// Mirrors the functions-side DiscountCode -- see that file's comment for why this is
// server-write-only (createDiscountCode/setDiscountCodeActive/setDiscountCodeAnnouncement/
// deleteDiscountCode) rather than client-writable.
export interface DiscountCode {
  code: string;
  sellerUid: string;
  kind: DiscountKind;
  type: DiscountType;
  amount: number;
  targetProductName: string | null;
  bogoBuyQuantity: number | null;
  bogoGetQuantity: number | null;
  active: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: number | null;
  expiresAt: number | null;
  announceOnSite: boolean;
  announceDurationMs: number | null;
  announcedAt: number | null;
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
  | 'openAccount'
  // Real cross-project actions (Phase 8) -- each mutates a specific project (or the account
  // catalog) rather than just navigating. `projectId` is a real id copied from the project
  // list the assistant was given in context, or null when it can't tell which project the
  // user means -- the client then asks the user to pick one via a chip list before executing.
  | 'createProduct'
  | 'editProduct'
  | 'insertProductOnPage'
  | 'publishProject'
  | 'addMenuItem';

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
  // Which project this action applies to -- a real id from the project list given in
  // context, or null when the assistant couldn't determine it (client disambiguates).
  projectId: string | null;
  // createProduct: name for the new product. editProduct/insertProductOnPage: name used to
  // find an existing catalog product (fuzzy match).
  productName: string | null;
  // createProduct only.
  priceUsd: number | null;
  // addMenuItem only: the menu item's label.
  menuLabel: string | null;
  // insertProductOnPage/addMenuItem: which page, by name (fuzzy match); null means "the
  // project's home/only page".
  pageName: string | null;
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
