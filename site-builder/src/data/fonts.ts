// Real Google Fonts, picked for range (clean sans, display/headline, script/handwriting,
// serif) rather than one style repeated. `ttfUrl` points at the actual font file (hosted by
// jsDelivr's GitHub CDN mirror of google/fonts) so expo-font can load real glyphs in the app
// -- `googleFontsQuery` is the matching Google Fonts CSS2 API family query, used to load the
// same typeface on the published static site via a <link> tag (see firebase/functions/src/siteHtml.ts).
export interface FontOption {
  id: string;
  label: string;
  family: string; // fontFamily value used both by expo-font and CSS
  ttfUrl: string | null; // null = platform default, nothing to download
  googleFontsQuery: string | null;
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'system', label: 'Default', family: 'System', ttfUrl: null, googleFontsQuery: null },
  {
    id: 'poppins',
    label: 'Poppins',
    family: 'Poppins',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Bold.ttf',
    googleFontsQuery: 'Poppins:wght@400;700',
  },
  {
    id: 'bebas-neue',
    label: 'Bebas Neue',
    family: 'Bebas Neue',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/bebasneue/BebasNeue-Regular.ttf',
    googleFontsQuery: 'Bebas+Neue',
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    family: 'Playfair Display',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf',
    googleFontsQuery: 'Playfair+Display:wght@400;700',
  },
  {
    id: 'pacifico',
    label: 'Pacifico',
    family: 'Pacifico',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/pacifico/Pacifico-Regular.ttf',
    googleFontsQuery: 'Pacifico',
  },
  {
    id: 'anton',
    label: 'Anton',
    family: 'Anton',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/anton/Anton-Regular.ttf',
    googleFontsQuery: 'Anton',
  },
  {
    id: 'righteous',
    label: 'Righteous',
    family: 'Righteous',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/righteous/Righteous-Regular.ttf',
    googleFontsQuery: 'Righteous',
  },
  {
    id: 'fredoka',
    label: 'Fredoka',
    family: 'Fredoka',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf',
    googleFontsQuery: 'Fredoka:wght@400;700',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    family: 'Space Grotesk',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf',
    googleFontsQuery: 'Space+Grotesk:wght@400;700',
  },
  {
    id: 'permanent-marker',
    label: 'Permanent Marker',
    family: 'Permanent Marker',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/permanentmarker/PermanentMarker-Regular.ttf',
    googleFontsQuery: 'Permanent+Marker',
  },
  {
    id: 'oswald',
    label: 'Oswald',
    family: 'Oswald',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/oswald/Oswald%5Bwght%5D.ttf',
    googleFontsQuery: 'Oswald:wght@400;700',
  },
  {
    id: 'caveat',
    label: 'Caveat',
    family: 'Caveat',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/caveat/Caveat%5Bwght%5D.ttf',
    googleFontsQuery: 'Caveat:wght@400;700',
  },
  {
    id: 'archivo-black',
    label: 'Archivo Black',
    family: 'Archivo Black',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/archivoblack/ArchivoBlack-Regular.ttf',
    googleFontsQuery: 'Archivo+Black',
  },
  {
    id: 'dm-serif-display',
    label: 'DM Serif Display',
    family: 'DM Serif Display',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf',
    googleFontsQuery: 'DM+Serif+Display',
  },
  {
    id: 'lobster',
    label: 'Lobster',
    family: 'Lobster',
    ttfUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lobster/Lobster-Regular.ttf',
    googleFontsQuery: 'Lobster',
  },
];

export function getFontOption(id?: string): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0];
}
