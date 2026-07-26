/**
 * TrackLine's own branded map look -- matches web/src/utils/mapStyles.ts (same brand colors:
 * black background, green accents for highways/roads). Standard Google Maps JSON styling
 * format, applied via react-native-maps' `customMapStyle` prop.
 *
 * Only actually renders on Android and on iOS builds using PROVIDER_GOOGLE -- Apple's native
 * MapKit (react-native-maps' default iOS renderer when no provider is set) has no equivalent
 * JSON styling mechanism, so this prop is a harmless no-op there rather than an error. See
 * MapScreen.tsx for which provider each platform currently uses.
 */
export const TRACKLINE_MAP_STYLE = [
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
