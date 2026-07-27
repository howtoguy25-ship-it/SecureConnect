// Estimates the likely number-plate region within an already-detected vehicle's box -- a real
// geometric estimate, not OCR and not a trained plate detector. Mirrors web's
// web/src/utils/plateLocator.ts *without* its pixel-level edge-energy scan (that needs
// canvas/getImageData, which React Native doesn't have without adding a whole separate
// rendering dependency) -- this stops at the same first stage: the lower-middle band of the
// vehicle silhouette, where a plate sits on the overwhelming majority of vehicles photographed
// from a following or oncoming angle. The actual OCR pass (plateOcr.ts) still gates on a real
// confidence threshold before ever showing text, so a coarser region here just means more
// crops get attempted and rejected, not that a wrong region gets presented as a real read.

// Real number plates are wide rectangles, not squares -- Australian plates run about 2.7:1
// (width:height).
const PLATE_ASPECT_RATIO = 2.7;

// Below this vehicle-box width (in source photo pixels), a plate crop wouldn't have enough
// resolution for OCR to have a real chance -- skip rather than waste a crop+OCR pass on noise.
const MIN_VEHICLE_WIDTH_PX = 180;

// A vehicle seen face-on (front or rear) has a bounding box roughly as wide as it is tall.
// Side-on, the box is much wider than tall -- and the plate isn't visible from the side at
// all. Same threshold as web's isFrontOrRearFacing.
const SIDE_ON_ASPECT_RATIO = 2.0;

/** True when a vehicle's box shape is consistent with a front/rear ("good") view rather than a
 *  side profile -- a plate is only ever visibly mounted on the front/rear. */
export function isFrontOrRearFacing(vehicleBbox: [number, number, number, number]): boolean {
  const [, , vw, vh] = vehicleBbox;
  if (vh <= 0) return false;
  return vw / vh < SIDE_ON_ASPECT_RATIO;
}

export interface PlateRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Returns the estimated plate rectangle (in source photo pixel coordinates) for one tracked
 *  vehicle's box, or null if the vehicle is too small/side-on for a plate crop to be worth
 *  attempting. */
export function locatePlateRegion(vehicleBbox: [number, number, number, number]): PlateRegion | null {
  const [vx, vy, vw, vh] = vehicleBbox;
  if (vw < MIN_VEHICLE_WIDTH_PX) return null;
  if (!isFrontOrRearFacing(vehicleBbox)) return null;

  const bandX = vx + vw * 0.12;
  const bandY = vy + vh * 0.58;
  const bandW = vw * 0.76;
  const bandH = vh * 0.24;
  if (bandW < 4 || bandH < 4) return null;

  // Shrink the band down toward real plate proportions instead of handing OCR the whole
  // (taller-than-a-plate) band -- centered vertically within it.
  const plateH = Math.min(bandH, bandW / PLATE_ASPECT_RATIO);

  return {
    x: bandX,
    y: bandY + (bandH - plateH) / 2,
    w: bandW,
    h: plateH,
  };
}
