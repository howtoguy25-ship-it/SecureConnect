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
