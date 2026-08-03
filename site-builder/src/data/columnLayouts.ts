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

// Real grid math for placing 2+ products together, instead of the free x/y stacking every
// other insert uses -- a professional store shows products in fixed rows/columns, not
// independently-floating cards. Fixed at 2 columns to match the app's one existing
// product-grid precedent (CollectionDetailModal's "2 products per row" convention), rather
// than inventing a different column count for exactly-3-selected; a 3rd product simply wraps
// to its own row. Returns real x/y/width/height for each product, relative to a (0,0) origin
// (offset by the caller, same convention buildColumnLayout already uses).
const PRODUCT_GRID_COLUMNS = 2;
const PRODUCT_GRID_GAP = 14;
const PRODUCT_CARD_ASPECT = 220 / 180; // matches the existing single-product default size
const HORIZONTAL_ROW_HEIGHT = 130; // Shopify-style list row: fixed height, full width, one per row

export type ProductGridCardLayout = 'portrait' | 'square' | 'horizontal';

export interface ProductGridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

// `cardLayout` picks the grid shape, mirroring the same three choices ProductElement.cardLayout
// offers on the element itself: 'portrait' (default) keeps the existing 2-column tall-card
// grid, 'square' reuses that same 2-column grid at a 1:1 aspect, and 'horizontal' switches to a
// real Shopify-style single-column list -- each product its own full-width row -- since a
// horizontal card only reads correctly at full width, not squeezed into half a row.
export function buildProductGridLayout(
  count: number,
  containerWidth: number,
  cardLayout: ProductGridCardLayout = 'portrait'
): { cells: ProductGridCell[]; height: number } {
  if (cardLayout === 'horizontal') {
    const cells: ProductGridCell[] = [];
    for (let i = 0; i < count; i++) {
      cells.push({ x: 0, y: i * (HORIZONTAL_ROW_HEIGHT + PRODUCT_GRID_GAP), width: containerWidth, height: HORIZONTAL_ROW_HEIGHT });
    }
    const height = count * HORIZONTAL_ROW_HEIGHT + (count - 1) * PRODUCT_GRID_GAP;
    return { cells, height };
  }
  const aspect = cardLayout === 'square' ? 1 : PRODUCT_CARD_ASPECT;
  const columns = Math.min(count, PRODUCT_GRID_COLUMNS);
  const cellWidth = (containerWidth - PRODUCT_GRID_GAP * (columns - 1)) / columns;
  const cellHeight = Math.round(cellWidth * aspect);
  const cells: ProductGridCell[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % PRODUCT_GRID_COLUMNS;
    const row = Math.floor(i / PRODUCT_GRID_COLUMNS);
    cells.push({
      x: col * (cellWidth + PRODUCT_GRID_GAP),
      y: row * (cellHeight + PRODUCT_GRID_GAP),
      width: cellWidth,
      height: cellHeight,
    });
  }
  const rows = Math.ceil(count / PRODUCT_GRID_COLUMNS);
  const height = rows * cellHeight + (rows - 1) * PRODUCT_GRID_GAP;
  return { cells, height };
}
