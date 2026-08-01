// TrackLine's own branded map look, built around the app's black + green brand palette
// rather than Google's stock road/poi/water palette -- real per-feature Maps JSON styling
// (the same format Google's own styling wizard produces), just designed to look like this
// app specifically instead of a generic preset. Only takes effect on raster/JS-styled maps;
// a vector map bound to a custom Map ID ignores inline `styles` entirely (Google requires
// configuring a style *on the Map ID itself* in Cloud Console for that case -- see the Map
// Styles page there if VITE_GOOGLE_MAPS_MAP_ID is set), so this is applied conditionally in
// App.tsx only when no Map ID is configured.
//
// Design intent: clear road hierarchy at a glance while driving (highways brightest/most
// saturated green, arterials next, local streets recede), poi/transit kept quiet so alert
// pins and the route line stay the visually loudest thing on screen, water/parks tinted
// toward the brand green instead of Google's default teal/blue so the whole map reads as
// one consistent, deliberate palette rather than a checklist of separately-colored layers.
export const LIGHT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f2f7f3" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3d4a3f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#1c241d" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#7c8f7e" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d9ecdc" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4f7a56" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#dce7de" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#2f3a30" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#eaf3ec" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#16a34a" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0f7a37" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#0f2414" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe8d6" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a7a58" }] },
];

// Map color themes -- an independent choice from the light/dark UI theme above (LIGHT_MAP_STYLE/
// DARK_MAP_STYLE stay exactly as-is and are what "Normal" continues to mean). Same standard
// Google Maps JSON styling format, ported 1:1 from the mobile app's own theme set (src/utils/
// mapStyle.ts) so both apps offer the same choices with identical colors. Each theme recolors
// the whole map consistently (land, water, roads, highways, labels) rather than just tinting
// the background, and keeps a deliberately high contrast between road surface and label text.
export type MapThemeKey = "normal" | "purpleBlue" | "blueGrey" | "greenYellow";

export const MAP_THEME_LABELS: Record<MapThemeKey, string> = {
  normal: "Normal",
  purpleBlue: "Purple & Blue",
  blueGrey: "Blue & Grey",
  greenYellow: "Green & Yellow",
};

// Deep indigo/purple land, violet-blue water, bright lavender highways.
const PURPLE_BLUE_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1033" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1033" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#c7bdf0" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#e4defa" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9c8fd6" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#201545" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#a89ae0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2159" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#140b29" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#b3a6e8" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#392c68" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#8b7cf6" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#140b29" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f2eeff" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#140b29" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#16224a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7d93d6" }] },
];

// Cool slate-grey land, deep blue water, bright sky-blue highways.
const BLUE_GREY_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#232a35" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#232a35" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b9c4d4" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#dde4ee" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8b98aa" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1c2833" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#7f95a6" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#3a4451" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#171d24" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9fadc0" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#48566a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#5b9bf0" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#171d24" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#eaf3ff" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#171d24" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#16273f" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6f93bf" }] },
];

// Deep forest-green land, teal water, bright gold/yellow highways.
const GREEN_YELLOW_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f2417" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f2417" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#c8e6b0" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#eef7de" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8fb877" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#173420" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#86b16d" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#243c26" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0a1810" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#a8cf8f" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#33512f" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#facc15" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0a1810" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#fffbe6" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#0a1810" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a2e2a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4fa090" }] },
];

// "normal" is intentionally absent here -- it means "use the existing light/dark UI-theme-
// aware style" (LIGHT_MAP_STYLE/DARK_MAP_STYLE above), handled directly in App.tsx's mapOptions
// rather than as a fixed style, since it's the one theme that still varies with light/dark mode.
export const MAP_THEME_STYLES: Partial<Record<MapThemeKey, google.maps.MapTypeStyle[]>> = {
  purpleBlue: PURPLE_BLUE_STYLE,
  blueGrey: BLUE_GREY_STYLE,
  greenYellow: GREEN_YELLOW_STYLE,
};

export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#000000" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#000000" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7ea787" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bcd6c1" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#587a5e" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0e1f11" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4f7a58" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#141814" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#000000" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6f8f75" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#1a231b" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#22c55e" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#000000" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#d9ffe4" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#000000" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#04120a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d6b4c" }] },
];
