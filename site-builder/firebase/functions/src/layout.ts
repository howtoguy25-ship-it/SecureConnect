import { CanvasElement, ButtonElement, CatalogProduct, ImageElement, TextElement, VideoEmbedElement, GameElement, ProductElement, WidgetElement, CustomWidgetElement } from './types';
import { SitePlan, SitePlanSection } from './openai';

const CANVAS_WIDTH = 390;
const MARGIN = 24;
const CONTENT_WIDTH = CANVAS_WIDTH - MARGIN * 2;

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

export function layoutSitePlan(
  plan: SitePlan,
  sectionImages: SectionImage[],
  sectionVideos: SectionVideo[] = [],
  sectionProductImages: SectionProductImages[] = [],
  sectionCustomWidgets: SectionCustomWidget[] = []
): SitePlanLayout {
  idCounter = 0;
  const elements: CanvasElement[] = [];
  const productContents: Record<string, LayoutProductContent> = {};
  let y = 32;

  const imageFor = (section: SitePlanSection) => sectionImages.find((s) => s.section === section)?.url ?? null;
  const videoFor = (section: SitePlanSection) => sectionVideos.find((s) => s.section === section) ?? null;
  const productImagesFor = (section: SitePlanSection) => sectionProductImages.find((s) => s.section === section)?.urls ?? [];
  const customWidgetFor = (section: SitePlanSection) => sectionCustomWidgets.find((s) => s.section === section) ?? null;

  plan.sections.forEach((section, index) => {
    const isHero = index === 0 && section.kind === 'hero';
    const image = imageFor(section);
    const headline = stripMarkdown(section.headline);
    const body = section.body ? stripMarkdown(section.body) : section.body;
    const buttonLabel = section.buttonLabel ? stripMarkdown(section.buttonLabel) : section.buttonLabel;
    const gameClickerLabel = section.gameClickerLabel ? stripMarkdown(section.gameClickerLabel) : section.gameClickerLabel;
    const gameMemorySymbols = section.gameMemorySymbols.map((s) => stripMarkdown(s));

    if (image && (section.kind === 'hero' || section.kind === 'gallery')) {
      const imgHeight = section.kind === 'hero' ? 200 : 220;
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
      const urls = productImagesFor(section);
      const name = stripMarkdown(section.productName || headline);
      const description = section.productDescription ? stripMarkdown(section.productDescription) : '';
      // Room for an inline swipeable gallery plus name/description/price/qty/buy button --
      // taller than a plain image section since a real product card needs more vertical
      // space than a decorative picture would.
      const productHeight = 340;
      const el = productEl({ y, height: productHeight });
      elements.push(el);
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
      y += productHeight + 16;
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

      if (body) {
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

  return { elements, productContents };
}

export function estimatedCanvasHeight(elements: CanvasElement[]): number {
  const bottom = elements.reduce((max, el) => Math.max(max, el.y + el.height), 0);
  return Math.max(844, bottom + 40);
}
