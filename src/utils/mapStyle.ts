/**
 * TrackLine's map color themes -- standard Google Maps JSON styling format, applied via
 * react-native-maps' `customMapStyle` prop. Each theme recolors the whole map consistently
 * (land, water, roads, highways, labels) rather than just tinting the background, and every
 * one keeps a deliberately high contrast between road surface and label text so street names
 * stay legible glancing at it while driving -- the actual point of a map, regardless of theme.
 *
 * Only actually renders on Android and on iOS builds using PROVIDER_GOOGLE -- Apple's native
 * MapKit (react-native-maps' default iOS renderer when no provider is set) has no equivalent
 * JSON styling mechanism, so this prop is a harmless no-op there rather than an error. See
 * MapScreen.tsx for which provider each platform currently uses.
 */
export type MapThemeKey = "normal" | "purpleBlue" | "blueGrey" | "greenYellow";

export const MAP_THEME_LABELS: Record<MapThemeKey, string> = {
  normal: "Normal",
  purpleBlue: "Purple & Blue",
  blueGrey: "Blue & Grey",
  greenYellow: "Green & Yellow",
};

// TrackLine's original brand look -- black background, green highways/text. Unchanged from
// before the theme picker existed; just renamed into the theme map as the "Normal" default.
const NORMAL_STYLE = [
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

// Deep indigo/purple land, violet-blue water, bright lavender highways -- streets get a
// visibly lighter purple than the land so they read clearly against it, matching the
// dark-background-plus-bright-road-accent pattern the "Normal" theme already established.
const PURPLE_BLUE_STYLE = [
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

// Cool slate-grey land, deep blue water, bright sky-blue highways -- a neutral, low-glare
// scheme (closest to a "night driving" feel) with the same bright-accent-on-dark-street
// pattern for road hierarchy to stay obvious at a glance.
const BLUE_GREY_STYLE = [
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

// Deep forest-green land, teal water, bright gold/yellow highways -- the highest-contrast pair
// of the four (yellow-on-dark-green), reserved for the highway/arterial accent only so it
// reads as "the important road" rather than the whole map competing for attention.
const GREEN_YELLOW_STYLE = [
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

export const MAP_THEME_STYLES: Record<MapThemeKey, typeof NORMAL_STYLE> = {
  normal: NORMAL_STYLE,
  purpleBlue: PURPLE_BLUE_STYLE,
  blueGrey: BLUE_GREY_STYLE,
  greenYellow: GREEN_YELLOW_STYLE,
};
