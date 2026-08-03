import { CanvasElement, ButtonElement, CatalogProduct, ImageElement, TextElement, VideoEmbedElement, GameElement, ProductElement, WidgetElement, CustomWidgetElement, SectionElement } from './types';
import { SitePlan, SitePlanSection } from './openai';

const CANVAS_WIDTH = 390;
const MARGIN = 24;
const CONTENT_WIDTH = CANVAS_WIDTH - MARGIN * 2;

// Mirrors src/data/canvasSizes.ts's CANVAS_SIZES -- kept in sync by hand since Cloud
// Functions run in a separate TS project and can't import straight from the client (same
// reasoning as pricing.ts's duplication). A Logo/Video/Social AI build always renders at
// its page type's own real fixed size (never content-driven the way a website page is),
// matching what the manual editor already uses for the same page types.
export const FIXED_PAGE_CANVAS_HEIGHT: Record<'video' | 'social' | 'logo', number> = {
  video: 693,
  social: 585,
  logo: 390,
};

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function textEl(partial: Partial<TextElement> & Pick<TextElement, 'text' | 'y'>): TextElement {
  return {
    id: nextId('el'),
    type: 'text',
    x: MARGIN,
    width: CONTENT_WIDTH,
    height: 40,
    zIndex: 2,
    fontSize: 16,
    color: '#0F172A',
    fontWeight: 'normal',
    align: 'left',
    ...partial,
  };
}

function buttonEl(partial: Partial<ButtonElement> & Pick<ButtonElement, 'label' | 'y'>): ButtonElement {
  return {
    id: nextId('el'),
    type: 'button',
    x: MARGIN,
    width: 160,
    height: 48,
    zIndex: 2,
    backgroundColor: '#111827',
    textColor: '#FFFFFF',
    borderRadius: 10,
    ...partial,
  };
}

function imageEl(partial: Partial<ImageElement> & Pick<ImageElement, 'y' | 'height'>): ImageElement {
  return {
    id: nextId('el'),
    type: 'image',
    x: MARGIN,
    width: CONTENT_WIDTH,
    zIndex: 1,
    uri: null,
    ...partial,
  };
}

function videoEmbedEl(
  partial: Partial<VideoEmbedElement> & Pick<VideoEmbedElement, 'y' | 'height' | 'videoId' | 'title'>
): VideoEmbedElement {
  return {
    id: nextId('el'),
    type: 'videoEmbed',
    provider: 'youtube',
    x: 0,
    width: CANVAS_WIDTH,
    zIndex: 1,
    ...partial,
  };
}

function gameEl(partial: Partial<GameElement> & Pick<GameElement, 'y' | 'height' | 'kind' | 'title'>): GameElement {
  return {
    id: nextId('el'),
    type: 'game',
    x: 0,
    width: CANVAS_WIDTH,
    zIndex: 1,
    questions: [],
    memorySymbols: [],
    clickerLabel: 'Tap!',
    clickerTarget: 20,
    ...partial,
  };
}

function productEl(partial: Partial<ProductElement> & Pick<ProductElement, 'y' | 'height'>): ProductElement {
  return {
    id: nextId('el'),
    type: 'product',
    productId: nextId('prod'),
    x: 0,
    width: CANVAS_WIDTH,
    zIndex: 1,
    ...partial,
  };
}

// Matches a product-kind section's name against the user's own real catalog (see
// buildSystemPrompt's existingProductNames instruction, which asks the model to copy an
// existing product's name back verbatim when the user asked to add/feature it by name) --
// case-insensitive, and bidirectional-substring so "Blue Hoodie" still matches a section
// named "Blue Hoodie - Large" and vice versa, mirroring the same loose match convention
// assistantExecuteAction already uses for editProduct/insertProductOnPage. Returns undefined
// (no match) whenever the AI wrote a genuinely new item name, which is the common case.
export function matchExistingProduct(name: string, existingCatalog: CatalogProduct[]): CatalogProduct | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return existingCatalog.find((p) => {
    const hay = p.name.trim().toLowerCase();
    return hay.length > 0 && (hay.includes(needle) || needle.includes(hay));
  });
}

// Real content for an AI-generated product section -- a ProductElement only ever stores a
// productId now (see the type's own comment), so the caller (index.ts's pushPreview) needs
// this alongside the elements to actually create/update the matching users/{uid}/products
// catalog doc, the same way a human using ProductEditScreen would.
export type LayoutProductContent = Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'>;

function customWidgetEl(
  partial: Partial<CustomWidgetElement> & Pick<CustomWidgetElement, 'y' | 'height' | 'title' | 'code'>
): CustomWidgetElement {
  return {
    id: nextId('el'),
    type: 'customWidget',
    x: 0,
    width: CANVAS_WIDTH,
    zIndex: 1,
    description: '',
    ...partial,
  };
}

function widgetEl(partial: Partial<WidgetElement> & Pick<WidgetElement, 'y' | 'height' | 'title'>): WidgetElement {
  return {
    id: nextId('el'),
    type: 'widget',
    kind: 'clock',
    x: 0,
    width: CANVAS_WIDTH,
    zIndex: 1,
    style: 'digital',
    timezones: [],
    countdownTargetIso: '',
    countdownLabel: '',
    ...partial,
  };
}

// Estimates how tall a text block needs to be for the canvas's fixed width, so the next
// section stacked below it never starts inside space this one's real wrapped text still
// needs -- undercounting here is exactly what causes headline/body/button text to visibly
// overlap on both the live preview and the real published page, since elements are
// absolutely positioned with a fixed height and nothing clips overflow.
//
// Two things the old estimate got wrong: (1) it divided the *whole* string's length by an
// optimistic chars-per-line, ignoring any real "\n" line breaks the AI's content already
// contains (bulleted feature lists are almost all explicit newlines, so that alone could
// undercount a 4-line list as one line); (2) word-wrapping breaks at spaces, not mid-word,
// so real lines almost always hold noticeably fewer characters than a flat width/charWidth
// division suggests. Both are fixed here, plus a per-block safety margin.
// The AI writes plain copy meant for a real <Text>/<div> element, but models often slip into
// chat-markdown habits (**bold**, `code`, "- " bullets) that render as literal asterisks/
// backticks once dropped into a page instead of being formatted -- stripped here, the single
// point where every generated headline/body/label becomes real element text, so every
// consumer (live build preview, the editor canvas, and the published site) sees clean text.
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .trim();
}

function estimateTextHeight(text: string, fontSize: number): number {
  // ~0.62 (rather than 0.55) accounts for word-wrap leaving a ragged right edge unused,
  // and bold/mixed-width system fonts running wider than a flat monospace-style estimate.
  const charsPerLine = Math.max(1, Math.floor(CONTENT_WIDTH / (fontSize * 0.62)));
  const totalLines = text
    .split('\n')
    .reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(paragraph.length / charsPerLine)), 0);
  // +25% line-height buffer (instead of a flat +8px) so the margin scales with how much
  // text there actually is, not just a fixed nudge that a 10-line paragraph blows past.
  return Math.ceil(totalLines * (fontSize * 1.4) * 1.25) + 12;
}

export interface SectionImage {
  section: SitePlanSection;
  url: string | null;
}

export interface SectionVideo {
  section: SitePlanSection;
  videoId: string | null;
  title: string | null;
}

// A product section needs several real angle-photos of the same item, not one hero shot --
// a parallel array (mirroring SectionVideo) rather than widening SectionImage.url to a union
// type that would mean two different things depending on which kind read it.
export interface SectionProductImages {
  section: SitePlanSection;
  urls: string[];
}

// A custom widget's final html already has any {{IMAGE_n}} placeholders substituted with
// real generated-image URLs by the time it reaches layout -- this just carries the finished
// code string through, mirroring SectionVideo/SectionProductImages' "one entry per section
// once its async generation settles" shape. code === null means generation failed for that
// section (never block the rest of the build on one bad widget).
export interface SectionCustomWidget {
  section: SitePlanSection;
  code: string | null;
}

export interface SitePlanLayout {
  elements: CanvasElement[];
  // Keyed by the same productId each element's ProductElement.productId points to.
  productContents: Record<string, LayoutProductContent>;
}

// A short (<=14 char), real, readable tab label for a section -- first word or two of its
// own real headline (not a generic "Section 1"), falling back to its kind when a section
// somehow has no headline yet (mid-generation preview).
function shortSectionLabel(section: SitePlanSection): string {
  const source = stripMarkdown(section.headline?.trim() || section.kind);
  const words = source.split(/\s+/).slice(0, 2).join(' ');
  return words.length > 14 ? `${words.slice(0, 13)}…` : words;
}

const NAV_BAR_HEIGHT = 56;
const NAV_TAB_GAP = 8;
// A narrow 390px canvas can't fit more than a handful of real tappable tabs before they'd
// get too cramped to read/tap -- caps the "prebuilt tabs" nav bar to the first few sections
// (skipping index 0, the hero, since a visitor is already looking at it) rather than
// shrinking tabs indefinitely to fit every section.
const MAX_NAV_TABS = 4;

// A real, working "prebuilt tabs" nav bar for Professional/Go All Out builds (see
// startGeneration's complexity param) -- a Section background plus one real Button per
// tab, each with scrollToY set to that section's actual on-page position. Returns an empty
// array (no nav bar) when there aren't at least 2 other sections worth jumping between.
function buildNavBar(sectionStarts: { label: string; y: number }[], accentColor: string, textColor: string): CanvasElement[] {
  const tabs = sectionStarts.slice(1, 1 + MAX_NAV_TABS); // skip the hero -- already visible
  if (tabs.length < 2) return [];

  const tabWidth = Math.floor((CONTENT_WIDTH - NAV_TAB_GAP * (tabs.length - 1)) / tabs.length);
  const bar: SectionElement = {
    id: nextId('el'),
    type: 'section',
    backgroundColor: '#FFFFFF',
    childIds: [],
    x: 0,
    y: 0,
    width: CANVAS_WIDTH,
    height: NAV_BAR_HEIGHT,
    zIndex: 0,
  };
  // A solid accent-filled pill (real brand color, white text, fully rounded, no border)
  // reads as an actual designed tab bar -- the previous transparent-background/colored-
  // border/colored-text look was indistinguishable from a plain unstyled outline button,
  // which is exactly the "very cheap" nav bar look this replaces.
  const tabHeight = NAV_BAR_HEIGHT - 16;
  const buttons: ButtonElement[] = tabs.map((tab, i) =>
    buttonEl({
      label: tab.label,
      y: 8,
      height: tabHeight,
      x: MARGIN + i * (tabWidth + NAV_TAB_GAP),
      width: tabWidth,
      backgroundColor: accentColor || textColor,
      textColor: '#FFFFFF',
      borderRadius: Math.round(tabHeight / 2),
      zIndex: 2,
      // Shifted by NAV_BAR_HEIGHT below (once the bar itself pushes every section down) --
      // set to a placeholder here and corrected by the caller once that shift is known.
      scrollToY: tab.y,
    })
  );
  bar.childIds = buttons.map((b) => b.id);
  return [bar, ...buttons];
}

export function layoutSitePlan(
  plan: SitePlan,
  sectionImages: SectionImage[],
  sectionVideos: SectionVideo[] = [],
  sectionProductImages: SectionProductImages[] = [],
  sectionCustomWidgets: SectionCustomWidget[] = [],
  // Real "prebuilt tabs" nav bar (see buildNavBar) -- only Professional ('standard') and Go
  // All Out ('crazy') builds get one; 'simple' stays exactly one plain scrolling page, no
  // extra chrome, matching what that tier promises.
  includeNavBar = false,
  // The real fixed frame height for a Logo/Video/Social build (see FIXED_PAGE_CANVAS_HEIGHT)
  // -- those page types are always a single section (enforced in buildSystemPrompt), so
  // instead of the small fixed 200px hero-image height below (sized for a website's
  // scrolling hero banner), the one image fills nearly this entire real frame, the way an
  // actual logo/post graphic should. Undefined/omitted for a website build, which keeps
  // sizing itself from estimatedCanvasHeight as before.
  singleCompositionCanvasHeight?: number,
  // The user's own real product catalog (users/{uid}/products) -- when a product-kind
  // section's name matches one of these (see matchExistingProduct), the resulting
  // ProductElement points at that REAL existing product id instead of a freshly-generated
  // one, and productContents is left untouched for it so the real catalog doc (its actual
  // photos/price/stock/variants) is imported into the build rather than overwritten with
  // AI-guessed placeholder data.
  existingCatalog: CatalogProduct[] = []
): SitePlanLayout {
  idCounter = 0;
  const elements: CanvasElement[] = [];
  const productContents: Record<string, LayoutProductContent> = {};
  const sectionStarts: { label: string; y: number }[] = [];
  let y = 32;
  const isSingleFixedComposition = singleCompositionCanvasHeight != null && plan.sections.length === 1;

  const imageFor = (section: SitePlanSection) => sectionImages.find((s) => s.section === section)?.url ?? null;
  const videoFor = (section: SitePlanSection) => sectionVideos.find((s) => s.section === section) ?? null;
  const productImagesFor = (section: SitePlanSection) => sectionProductImages.find((s) => s.section === section)?.urls ?? [];
  const customWidgetFor = (section: SitePlanSection) => sectionCustomWidgets.find((s) => s.section === section) ?? null;

  // Detect runs of 2+ CONSECUTIVE 'product' kind sections -- the AI's own instructions already
  // say "one section per distinct item" for products (see openai.ts's buildSystemPrompt), so a
  // multi-item store naturally produces several product sections back to back. Laying those
  // out as N full-width 340px cards stacked one under another (the original single-product
  // path, kept below for a lone product) reads as a cheap, disconnected list -- a real store
  // groups them into an actual grid, matching the manual editor's own insertMultipleProducts
  // (EditorScreen.tsx) grid-insert behavior exactly: real 2-column math, wrapped in a Section,
  // each card locked so it reads as a fixed store shelf instead of independently-floating
  // cards. A lone product section (no adjacent product sections) keeps the original full-width
  // single-card layout unchanged -- that's still the right presentation for one hero item.
  const productRunLength = new Map<number, number>();
  const productRunSkip = new Set<number>();
  for (let i = 0; i < plan.sections.length; i++) {
    if (plan.sections[i].kind !== 'product' || productRunSkip.has(i) || productRunLength.has(i)) continue;
    let runEnd = i;
    while (runEnd + 1 < plan.sections.length && plan.sections[runEnd + 1].kind === 'product') runEnd++;
    productRunLength.set(i, runEnd - i + 1);
    for (let j = i + 1; j <= runEnd; j++) productRunSkip.add(j);
  }

  plan.sections.forEach((section, index) => {
    if (productRunSkip.has(index)) return;
    sectionStarts.push({ label: shortSectionLabel(section), y });
    const isHero = index === 0 && section.kind === 'hero';
    const image = imageFor(section);
    const headline = stripMarkdown(section.headline);
    const body = section.body ? stripMarkdown(section.body) : section.body;
    const buttonLabel = section.buttonLabel ? stripMarkdown(section.buttonLabel) : section.buttonLabel;
    const gameClickerLabel = section.gameClickerLabel ? stripMarkdown(section.gameClickerLabel) : section.gameClickerLabel;
    const gameMemorySymbols = section.gameMemorySymbols.map((s) => stripMarkdown(s));

    if (image && (section.kind === 'hero' || section.kind === 'gallery')) {
      // Reserves real room below the image only if there's an actual headline to show
      // there (a logo's wordmark is often baked into the image itself, leaving headline
      // empty -- see buildSystemPrompt's pageTypeNote) -- 72 covers the top margin + the
      // gap below the image + the trailing between-sections gap, all of which apply
      // regardless of whether a headline follows.
      const imgHeight = isSingleFixedComposition
        ? Math.max(120, singleCompositionCanvasHeight! - 72 - (headline ? 64 : 0))
        : section.kind === 'hero'
          ? 200
          : 220;
      elements.push(imageEl({ y, height: imgHeight, uri: image, x: 0, width: CANVAS_WIDTH }));
      y += imgHeight + 16;
    }

    if (section.kind === 'video') {
      const video = videoFor(section);
      if (video?.videoId) {
        const videoHeight = Math.round((CANVAS_WIDTH * 9) / 16); // real 16:9 embed
        elements.push(videoEmbedEl({ y, height: videoHeight, videoId: video.videoId, title: video.title ? stripMarkdown(video.title) : headline }));
        y += videoHeight + 16;
      }
    }

    if (section.kind === 'game' && section.gameKind) {
      // Taller for trivia/memory (need room for a question + 4 options, or a card grid) and
      // tetris/targetrange3d/basketball (need room for a grid/canvas plus on-screen controls
      // or a real 3D scene) than tic-tac-toe/clicker, which are compact by nature.
      const gameHeight =
        section.gameKind === 'trivia' || section.gameKind === 'memory'
          ? 340
          : section.gameKind === 'basketball'
            ? 320
            : section.gameKind === 'connect4' || section.gameKind === 'tetris' || section.gameKind === 'targetrange3d'
              ? 300
              : 260;
      elements.push(
        gameEl({
          y,
          height: gameHeight,
          kind: section.gameKind,
          title: headline,
          questions: section.gameQuestions.map((q) => ({ ...q, question: stripMarkdown(q.question), options: q.options.map((o) => stripMarkdown(o)) })),
          memorySymbols: gameMemorySymbols,
          clickerLabel: gameClickerLabel || 'Tap!',
        })
      );
      y += gameHeight + 16;
    }

    if (section.kind === 'product') {
      const runLength = productRunLength.get(index) ?? 1;
      if (runLength >= 2) {
        const runSections = plan.sections.slice(index, index + runLength);
        const gridGap = 14;
        const columns = 2;
        const cellWidth = (CONTENT_WIDTH - gridGap * (columns - 1)) / columns;
        const cellHeight = Math.round(cellWidth * (220 / 180));
        const rows = Math.ceil(runLength / columns);
        const gridHeight = rows * cellHeight + (rows - 1) * gridGap;
        const gridY = y;
        const productEls: ProductElement[] = runSections.map((runSection, i) => {
          const col = i % columns;
          const row = Math.floor(i / columns);
          const name = stripMarkdown(runSection.productName || stripMarkdown(runSection.headline));
          const existingMatch = matchExistingProduct(runSection.productName || name, existingCatalog);
          const el = productEl({
            y: gridY + row * (cellHeight + gridGap),
            height: cellHeight,
            x: MARGIN + col * (cellWidth + gridGap),
            width: cellWidth,
            locked: true,
            ...(existingMatch ? { productId: existingMatch.id } : {}),
          });
          // A matched product is the user's own real catalog item -- its real
          // photos/price/stock/variants must be imported as-is, never overwritten with
          // AI-guessed placeholder content, so productContents deliberately stays untouched
          // for it (see pushPreview's comment on why a plain overwrite is normally fine).
          if (!existingMatch) {
            productContents[el.productId] = {
              name,
              description: runSection.productDescription ? stripMarkdown(runSection.productDescription) : '',
              priceUsd: runSection.productPriceUsd || 0,
              compareAtPriceUsd: null,
              costUsd: null,
              images: productImagesFor(runSection),
              trackInventory: false,
              initialStock: null,
              inStock: true,
              saleType: runSection.productSaleType || 'product',
              fulfillment: 'pickup',
              serviceDurationMinutes: null,
              variantOptions: [],
              variants: [],
            };
          }
          return el;
        });
        const gridSection: SectionElement = {
          id: nextId('el'),
          type: 'section',
          backgroundColor: '#FFFFFF',
          childIds: productEls.map((p) => p.id),
          x: MARGIN,
          y: gridY,
          width: CONTENT_WIDTH,
          height: gridHeight,
          zIndex: 0,
        };
        elements.push(gridSection);
        productEls.forEach((el) => elements.push(el));
        y += gridHeight + 16;
      } else {
        const urls = productImagesFor(section);
        const name = stripMarkdown(section.productName || headline);
        const description = section.productDescription ? stripMarkdown(section.productDescription) : '';
        const existingMatch = matchExistingProduct(section.productName || name, existingCatalog);
        // Room for an inline swipeable gallery plus name/description/price/qty/buy button --
        // taller than a plain image section since a real product card needs more vertical
        // space than a decorative picture would.
        const productHeight = 340;
        const el = productEl({ y, height: productHeight, ...(existingMatch ? { productId: existingMatch.id } : {}) });
        elements.push(el);
        // Same "never overwrite a real catalog match" rule as the grid branch above.
        if (!existingMatch) {
          productContents[el.productId] = {
            name,
            description,
            priceUsd: section.productPriceUsd || 0,
            compareAtPriceUsd: null,
            costUsd: null,
            images: urls,
            trackInventory: false,
            initialStock: null,
            inStock: true,
            saleType: section.productSaleType || 'product',
            fulfillment: 'pickup',
            serviceDurationMinutes: null,
            variantOptions: [],
            variants: [],
          };
        }
        y += productHeight + 16;
      }
    }

    if (section.kind === 'widget' && section.widgetKind === 'clock') {
      const timezones = section.widgetTimezones.map((tz) => ({ label: stripMarkdown(tz.label), ianaTimezone: tz.ianaTimezone }));
      // Scales with how many timezones a real world clock needs room to lay out side by side.
      const widgetHeight = 160 + Math.max(0, timezones.length - 1) * 40;
      elements.push(
        widgetEl({
          y,
          height: widgetHeight,
          kind: 'clock',
          title: headline,
          timezones: timezones.length > 0 ? timezones : [{ label: 'Local Time', ianaTimezone: 'UTC' }],
          style: 'digital',
        })
      );
      y += widgetHeight + 16;
    }

    if (section.kind === 'widget' && section.widgetKind === 'countdown') {
      const widgetHeight = 200;
      const targetIso = section.widgetCountdownTargetIso || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      elements.push(
        widgetEl({
          y,
          height: widgetHeight,
          kind: 'countdown',
          title: headline,
          countdownTargetIso: targetIso,
          countdownLabel: section.widgetCountdownLabel ? stripMarkdown(section.widgetCountdownLabel) : headline,
        })
      );
      y += widgetHeight + 16;
    }

    if (section.kind === 'widget' && section.widgetKind === 'stopwatch') {
      const widgetHeight = 220;
      elements.push(widgetEl({ y, height: widgetHeight, kind: 'stopwatch', title: headline }));
      y += widgetHeight + 16;
    }

    if (section.kind === 'widget' && section.widgetKind === 'calculator') {
      const widgetHeight = 340;
      elements.push(widgetEl({ y, height: widgetHeight, kind: 'calculator', title: headline }));
      y += widgetHeight + 16;
    }

    if (section.kind === 'widget' && section.widgetKind === 'unitconverter') {
      const widgetHeight = 280;
      elements.push(widgetEl({ y, height: widgetHeight, kind: 'unitconverter', title: headline }));
      y += widgetHeight + 16;
    }

    if (section.kind === 'custom') {
      const custom = customWidgetFor(section);
      if (custom?.code) {
        // Height is a rough guess -- a bespoke AI-written widget's real content can't be
        // measured ahead of time the way a fixed layout can, so this errs generous (enough
        // for a small game/calculator-sized tool) rather than clipping real content; the
        // iframe itself scrolls internally if a widget genuinely needs more room.
        const widgetHeight = 360;
        elements.push(
          customWidgetEl({
            y,
            height: widgetHeight,
            title: headline,
            description: section.customDescription ? stripMarkdown(section.customDescription) : '',
            code: custom.code,
          })
        );
        y += widgetHeight + 16;
      }
    }

    // A product/widget card already shows its own name/title prominently -- a separate
    // headline pushed right above it (e.g. "Cozy Reading Lamp" text, then a card that also
    // says "Cozy Reading Lamp") would be redundant, so these two kinds skip the generic
    // headline/body/button block below entirely. A custom section only skips it once its
    // widget actually rendered -- if generation failed (customWidgetFor(section) has no
    // code), falling through to plain headline/body means that section still shows
    // something real instead of silently vanishing from the page. Every other kind
    // (including "game", which does still benefit from its own intro copy) is unaffected.
    const customFailed = section.kind === 'custom' && !customWidgetFor(section)?.code;
    if (section.kind !== 'product' && section.kind !== 'widget' && (section.kind !== 'custom' || customFailed)) {
      const headlineSize = isHero ? 28 : 22;
      const headlineHeight = estimateTextHeight(headline, headlineSize);
      elements.push(
        textEl({
          text: headline,
          y,
          fontSize: headlineSize,
          fontWeight: 'bold',
          color: plan.textColor,
          height: headlineHeight,
          align: section.kind === 'cta' ? 'center' : 'left',
        })
      );
      y += headlineHeight + 6;

      // A real "Why Choose Us"/"Our Services"-style list (see openai.ts's featureItems
      // field) renders as a real interactive accordion -- collapsed rows in real columns,
      // tap one to expand and reveal its description -- instead of the AI cramming "•"
      // bullet lines into one plain body paragraph, which is the exact "very plain, not
      // stylish" look this replaces (see WidgetElement's 'accordion' kind for the real
      // tap-to-expand behavior on both the editor canvas and the published site). Falls
      // back to the plain body paragraph below whenever the model left featureItems empty
      // (a short prose "About us" section, or an older plan generated before this field
      // existed), so nothing regresses for those cases.
      if (section.featureItems && section.featureItems.length > 0) {
        const items = section.featureItems.map((item) => ({
          label: stripMarkdown(item.label),
          description: item.description ? stripMarkdown(item.description) : '',
        }));
        // 2 columns once there are enough items for a grid to read as one instead of a
        // cramped pair -- a lone 2-3 item list stays a single, easy-to-scan column.
        const columns: 1 | 2 = items.length >= 4 ? 2 : 1;
        const rows = Math.ceil(items.length / columns);
        // Collapsed-row height estimate (title + padding) times how many rows fit on
        // screen at once -- the accordion scrolls internally for the rest (see
        // renderAccordionWidgetHtml's own comment), so this never has to be exact, just a
        // reasonable amount of the section visible without scrolling on first view.
        const collapsedRowHeight = 52;
        const visibleRows = Math.min(rows, 4);
        const accordionHeight = visibleRows * (collapsedRowHeight + 10);
        elements.push(
          widgetEl({
            y,
            height: accordionHeight,
            title: '',
            x: MARGIN,
            width: CONTENT_WIDTH,
            kind: 'accordion',
            accordionItems: items,
            accordionColumns: columns,
            accordionAccentColor: plan.accentColor,
          })
        );
        y += accordionHeight + 16;
      } else if (body) {
        const bodyHeight = estimateTextHeight(body, 15);
        elements.push(
          textEl({
            text: body,
            y,
            fontSize: 15,
            color: '#475569',
            height: bodyHeight,
            align: section.kind === 'cta' ? 'center' : 'left',
          })
        );
        y += bodyHeight + 10;
      }

      if (buttonLabel && (section.kind === 'hero' || section.kind === 'cta')) {
        const buttonX = section.kind === 'cta' ? (CANVAS_WIDTH - 160) / 2 : MARGIN;
        elements.push(buttonEl({ label: buttonLabel, y, x: buttonX, backgroundColor: plan.accentColor }));
        y += 48 + 16;
      }
    }

    y += 24; // gap between sections
  });

  if (includeNavBar) {
    const navElements = buildNavBar(sectionStarts, plan.accentColor, plan.textColor);
    if (navElements.length > 0) {
      // Every already-placed element (and every tab's own scroll target, captured above
      // before the bar existed) shifts down by exactly the bar's own height, so the bar
      // slots in above everything without covering or overlapping the first section.
      const shifted = elements.map((el) => ({ ...el, y: el.y + NAV_BAR_HEIGHT }));
      const shiftedNav = navElements.map((el) =>
        el.type === 'button' && el.scrollToY != null ? { ...el, scrollToY: el.scrollToY + NAV_BAR_HEIGHT } : el
      );
      return { elements: [...shiftedNav, ...shifted], productContents };
    }
  }

  return { elements, productContents };
}

export function estimatedCanvasHeight(elements: CanvasElement[]): number {
  const bottom = elements.reduce((max, el) => Math.max(max, el.y + el.height), 0);
  return Math.max(844, bottom + 40);
}
