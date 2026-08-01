// Single source of truth for the traffic-light/speed-camera OSM layer's icon, color, and size --
// shared between the actual map pins (MapScreen.tsx) and the on/off toggle rows in Settings, so
// the two always visually match instead of drifting out of sync.
//
// Sized deliberately differently: speed cameras are the rarer, higher-stakes alert (a fixed
// camera can mean a real fine), so its pin is much larger and harder to miss glancing at the
// map. Traffic lights are by far the more common marker (dozens on screen at once in a city),
// so it stays small to avoid cluttering the map -- and uses a visibly different glyph (outline,
// not filled) rather than just a smaller copy of the same shape, so the two read as distinct
// marker types even at a glance, not just "big dot vs small dot."
export const TRAFFIC_LIGHT_MARKER = {
  icon: "traffic-light-outline" as const,
  color: "#0D9488",
  badgeSize: 14,
  glyphSize: 9,
};

export const SPEED_CAMERA_MARKER = {
  icon: "cctv" as const,
  color: "#7C3AED",
  badgeSize: 30,
  glyphSize: 18,
};
