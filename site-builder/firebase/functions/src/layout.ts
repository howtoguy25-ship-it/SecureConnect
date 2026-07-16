import { CanvasElement, ButtonElement, ImageElement, TextElement } from './types';
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

// Roughly estimates how tall a text block needs to be for the canvas's fixed width,
// based on character count -- good enough for stacking sections without overlap; the
// editor's own resize handles let the user fine-tune afterward if it's ever off.
function estimateTextHeight(text: string, fontSize: number): number {
  const charsPerLine = Math.floor(CONTENT_WIDTH / (fontSize * 0.55));
  const lines = Math.max(1, Math.ceil(text.length / Math.max(charsPerLine, 1)));
  return lines * (fontSize * 1.4) + 8;
}

export interface SectionImage {
  section: SitePlanSection;
  url: string | null;
}

export function layoutSitePlan(plan: SitePlan, sectionImages: SectionImage[]): CanvasElement[] {
  idCounter = 0;
  const elements: CanvasElement[] = [];
  let y = 32;

  const imageFor = (section: SitePlanSection) => sectionImages.find((s) => s.section === section)?.url ?? null;

  plan.sections.forEach((section, index) => {
    const isHero = index === 0 && section.kind === 'hero';
    const image = imageFor(section);

    if (image && (section.kind === 'hero' || section.kind === 'gallery')) {
      const imgHeight = section.kind === 'hero' ? 200 : 220;
      elements.push(imageEl({ y, height: imgHeight, uri: image, x: 0, width: CANVAS_WIDTH }));
      y += imgHeight + 16;
    }

    const headlineSize = isHero ? 28 : 22;
    const headlineHeight = estimateTextHeight(section.headline, headlineSize);
    elements.push(
      textEl({
        text: section.headline,
        y,
        fontSize: headlineSize,
        fontWeight: 'bold',
        color: plan.textColor,
        height: headlineHeight,
        align: section.kind === 'cta' ? 'center' : 'left',
      })
    );
    y += headlineHeight + 6;

    if (section.body) {
      const bodyHeight = estimateTextHeight(section.body, 15);
      elements.push(
        textEl({
          text: section.body,
          y,
          fontSize: 15,
          color: '#475569',
          height: bodyHeight,
          align: section.kind === 'cta' ? 'center' : 'left',
        })
      );
      y += bodyHeight + 10;
    }

    if (section.buttonLabel && (section.kind === 'hero' || section.kind === 'cta')) {
      const buttonX = section.kind === 'cta' ? (CANVAS_WIDTH - 160) / 2 : MARGIN;
      elements.push(buttonEl({ label: section.buttonLabel, y, x: buttonX, backgroundColor: plan.accentColor }));
      y += 48 + 16;
    }

    y += 24; // gap between sections
  });

  return elements;
}

export function estimatedCanvasHeight(elements: CanvasElement[]): number {
  const bottom = elements.reduce((max, el) => Math.max(max, el.y + el.height), 0);
  return Math.max(844, bottom + 40);
}
