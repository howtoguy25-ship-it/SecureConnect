import { CanvasElement, ButtonElement, ImageElement, TextElement, VideoEmbedElement, GameElement } from './types';
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

export function layoutSitePlan(plan: SitePlan, sectionImages: SectionImage[], sectionVideos: SectionVideo[] = []): CanvasElement[] {
  idCounter = 0;
  const elements: CanvasElement[] = [];
  let y = 32;

  const imageFor = (section: SitePlanSection) => sectionImages.find((s) => s.section === section)?.url ?? null;
  const videoFor = (section: SitePlanSection) => sectionVideos.find((s) => s.section === section) ?? null;

  plan.sections.forEach((section, index) => {
    const isHero = index === 0 && section.kind === 'hero';
    const image = imageFor(section);

    if (image && (section.kind === 'hero' || section.kind === 'gallery')) {
      const imgHeight = section.kind === 'hero' ? 200 : 220;
      elements.push(imageEl({ y, height: imgHeight, uri: image, x: 0, width: CANVAS_WIDTH }));
      y += imgHeight + 16;
    }

    if (section.kind === 'video') {
      const video = videoFor(section);
      if (video?.videoId) {
        const videoHeight = Math.round((CANVAS_WIDTH * 9) / 16); // real 16:9 embed
        elements.push(videoEmbedEl({ y, height: videoHeight, videoId: video.videoId, title: video.title ?? section.headline }));
        y += videoHeight + 16;
      }
    }

    if (section.kind === 'game' && section.gameKind) {
      // Taller for trivia/memory (need room for a question + 4 options, or a card grid) and
      // tetris/targetrange3d (need room for a grid/canvas plus on-screen controls) than
      // tic-tac-toe/clicker, which are compact by nature.
      const gameHeight =
        section.gameKind === 'trivia' || section.gameKind === 'memory'
          ? 340
          : section.gameKind === 'connect4' || section.gameKind === 'tetris' || section.gameKind === 'targetrange3d'
            ? 300
            : 260;
      elements.push(
        gameEl({
          y,
          height: gameHeight,
          kind: section.gameKind,
          title: section.headline,
          questions: section.gameQuestions,
          memorySymbols: section.gameMemorySymbols,
          clickerLabel: section.gameClickerLabel || 'Tap!',
        })
      );
      y += gameHeight + 16;
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
