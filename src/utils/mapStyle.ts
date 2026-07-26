/**
 * TrackLine's own branded map look -- matches web/src/utils/mapStyles.ts (same brand colors:
 * navy #0B1220 background, #2563EB accent blue). Standard Google Maps JSON styling format,
 * applied via react-native-maps' `customMapStyle` prop.
 *
 * Only actually renders on Android and on iOS builds using PROVIDER_GOOGLE -- Apple's native
 * MapKit (react-native-maps' default iOS renderer when no provider is set) has no equivalent
 * JSON styling mechanism, so this prop is a harmless no-op there rather than an error. See
 * MapScreen.tsx for which provider each platform currently uses.
 */
export const TRACKLINE_MAP_STYLE = [
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
