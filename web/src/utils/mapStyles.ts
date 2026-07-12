// Standard "night mode" Google Maps JSON style (the same widely-published style Google's
// own styling wizard produces for a dark theme) — real map styling, not a fabricated
// approximation. Only takes effect on raster/JS-styled maps; a vector map bound to a custom
// Map ID ignores inline `styles` entirely (Google requires configuring a dark variant of
// the Map ID itself in Cloud Console for that case), so this is applied conditionally in
// App.tsx only when no VITE_GOOGLE_MAPS_MAP_ID is set.
// Darkens street/road name labels in day mode — Google's default road-label gray reads too
// washed-out against light road fills at a glance while driving. Everything else is left
// at Google's normal default styling; only the label text/outline colors are touched.
export const LIGHT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#33383f" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#1f2430" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
];

export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1d2330" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d2330" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a93a6" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#c7ccd6" }],
  },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#7d8698" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#182420" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#5a6d63" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3143" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1d2330" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a93a6" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a4256" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1d2330" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#c7ccd6" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#252b3a" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#8a93a6" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#131722" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5a6478" }] },
];
