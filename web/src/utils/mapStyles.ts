// TrackLine's own branded map look, built around the app's actual brand colors (navy
// #0B1220 background, #2563EB accent blue used throughout the UI chrome) rather than
// Google's stock road/poi/water palette -- real per-feature Maps JSON styling (the same
// format Google's own styling wizard produces), just designed to look like this app
// specifically instead of a generic dark-mode preset. Only takes effect on raster/JS-styled
// maps; a vector map bound to a custom Map ID ignores inline `styles` entirely (Google
// requires configuring a style *on the Map ID itself* in Cloud Console for that case -- see
// the Map Styles page there if VITE_GOOGLE_MAPS_MAP_ID is set), so this is applied
// conditionally in App.tsx only when no Map ID is configured.
//
// Design intent: clear road hierarchy at a glance while driving (highways brightest/most
// saturated, arterials next, local streets recede), poi/transit kept quiet so alert pins and
// the route line stay the visually loudest thing on screen, water/parks tinted toward the
// brand blue/navy instead of Google's default teal/green so the whole map reads as one
// consistent, deliberate palette rather than a checklist of separately-colored layers.
export const LIGHT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f4f6fb" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4b5468" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#1f2430" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8a93a6" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e2ecdf" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6f8a68" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#dde3ee" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#33383f" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#eef1f8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2563eb" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1d4ed8" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#1f2430" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe0f7" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5a7aa8" }] },
];

export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a93a6" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c7ccd6" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6b7385" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#131c18" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#526054" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#182035" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7b8496" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#1c2540" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2563eb" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#dbe4ff" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1830" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a6da8" }] },
];
