// Pre-built column/row layouts a seller can drop onto a page in one tap -- e.g. "2 Columns"
// or "Image + Text" -- instead of building the same heading+paragraph blocks side by side by
// hand every time. Each template is just an arrangement of rows of cells (a cell is either a
// text block or an image placeholder); `buildColumnLayout` lays those out into real element
// specs relative to a (0,0) origin, shared by both the picker's live preview (scaled down) and
// the real insertion logic (offset to wherever it actually lands) -- so the preview always
// matches exactly what gets placed, never a fake mockup icon.

export type ColumnCellKind = 'textBlock' | 'image';

export interface ColumnLayoutTemplate {
  id: string;
  label: string;
  rows: ColumnCellKind[][];
}

export const COLUMN_LAYOUT_TEMPLATES: ColumnLayoutTemplate[] = [
  { id: 'cols-2', label: '2 Columns', rows: [['textBlock', 'textBlock']] },
  { id: 'cols-3', label: '3 Columns', rows: [['textBlock', 'textBlock', 'textBlock']] },
  { id: 'image-text', label: 'Image + Text', rows: [['image', 'textBlock']] },
  { id: 'text-image', label: 'Text + Image', rows: [['textBlock', 'image']] },
  { id: 'grid-2x2', label: '2x2 Grid', rows: [['textBlock', 'textBlock'], ['textBlock', 'textBlock']] },
];

const GUTTER = 16;
const ROW_GAP = 16;
const IMAGE_CELL_HEIGHT = 110;
const HEADING_HEIGHT = 24;
const HEADING_BODY_GAP = 6;
const BODY_HEIGHT = 44;
const TEXT_CELL_HEIGHT = HEADING_HEIGHT + HEADING_BODY_GAP + BODY_HEIGHT;

export type ColumnElementSpec =
  | { kind: 'text'; x: number; y: number; width: number; height: number; text: string; fontSize: number; fontWeight: 'normal' | 'bold'; color: string }
  | { kind: 'image'; x: number; y: number; width: number; height: number };

export interface BuiltColumnLayout {
  elements: ColumnElementSpec[];
  width: number;
  height: number;
}

export function buildColumnLayout(template: ColumnLayoutTemplate, width: number): BuiltColumnLayout {
  const elements: ColumnElementSpec[] = [];
  let y = 0;
  for (const row of template.rows) {
    const cols = row.length;
    const cellWidth = (width - GUTTER * (cols - 1)) / cols;
    const rowHeight = Math.max(...row.map((cell) => (cell === 'image' ? IMAGE_CELL_HEIGHT : TEXT_CELL_HEIGHT)));
    row.forEach((cell, i) => {
      const x = i * (cellWidth + GUTTER);
      if (cell === 'image') {
        elements.push({ kind: 'image', x, y, width: cellWidth, height: IMAGE_CELL_HEIGHT });
      } else {
        elements.push({
          kind: 'text',
          x,
          y,
          width: cellWidth,
          height: HEADING_HEIGHT,
          text: 'New Heading',
          fontSize: 16,
          fontWeight: 'bold',
          color: '#0F172A',
        });
        elements.push({
          kind: 'text',
          x,
          y: y + HEADING_HEIGHT + HEADING_BODY_GAP,
          width: cellWidth,
          height: BODY_HEIGHT,
          text: 'Add your text here.',
          fontSize: 13,
          fontWeight: 'normal',
          color: '#475569',
        });
      }
    });
    y += rowHeight + ROW_GAP;
  }
  return { elements, width, height: Math.max(0, y - ROW_GAP) };
}
