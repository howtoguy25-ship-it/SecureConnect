// Mirrors the app's src/data/fonts.ts font list (id + family + Google Fonts CSS2 query only
// -- the published site loads real glyphs via a <link> to fonts.googleapis.com rather than
// the raw jsDelivr .ttf the app uses with expo-font, so ttfUrl isn't needed here). Keep the
// id/family/query in sync by hand if the app's font list ever changes.
export interface FontOption {
  id: string;
  family: string;
  googleFontsQuery: string | null;
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'system', family: 'System', googleFontsQuery: null },
  { id: 'poppins', family: 'Poppins', googleFontsQuery: 'Poppins:wght@400;700' },
  { id: 'bebas-neue', family: 'Bebas Neue', googleFontsQuery: 'Bebas+Neue' },
  { id: 'playfair-display', family: 'Playfair Display', googleFontsQuery: 'Playfair+Display:wght@400;700' },
  { id: 'pacifico', family: 'Pacifico', googleFontsQuery: 'Pacifico' },
  { id: 'anton', family: 'Anton', googleFontsQuery: 'Anton' },
  { id: 'righteous', family: 'Righteous', googleFontsQuery: 'Righteous' },
  { id: 'fredoka', family: 'Fredoka', googleFontsQuery: 'Fredoka:wght@400;700' },
  { id: 'space-grotesk', family: 'Space Grotesk', googleFontsQuery: 'Space+Grotesk:wght@400;700' },
  { id: 'permanent-marker', family: 'Permanent Marker', googleFontsQuery: 'Permanent+Marker' },
  { id: 'oswald', family: 'Oswald', googleFontsQuery: 'Oswald:wght@400;700' },
  { id: 'caveat', family: 'Caveat', googleFontsQuery: 'Caveat:wght@400;700' },
  { id: 'archivo-black', family: 'Archivo Black', googleFontsQuery: 'Archivo+Black' },
  { id: 'dm-serif-display', family: 'DM Serif Display', googleFontsQuery: 'DM+Serif+Display' },
  { id: 'lobster', family: 'Lobster', googleFontsQuery: 'Lobster' },
];

export function getFontOption(id?: string | null): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0];
}
