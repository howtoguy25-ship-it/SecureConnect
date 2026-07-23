// Converts a CSS-style linear-gradient angle (0deg = bottom-to-top, 90deg = left-to-right,
// clockwise from there) into the {x,y} start/end points expo-linear-gradient's
// <LinearGradient> expects, so the exact same GradientFill value renders identically in the
// editor (RN) and on the published site (real CSS, which takes the angle directly).
export function gradientStartEnd(angleDeg: number): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = Math.cos(rad) / 2;
  return { start: { x: 0.5 - dx, y: 0.5 + dy }, end: { x: 0.5 + dx, y: 0.5 - dy } };
}
