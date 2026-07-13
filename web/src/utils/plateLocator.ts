// Finds the likely number-plate region within an already-detected vehicle's box -- a real,
// live, per-frame computed estimate, not a trained plate-recognition model and not OCR. It
// does NOT read the plate's characters/number, only estimates where the plate rectangle sits,
// the same honesty tier as lightbarDetector.ts's strobing-light heuristic in this codebase:
// real signal processing on real pixels, clearly not a certified detector.
//
// How it works: plates are small, high-contrast, text-dense rectangles sitting in a
// predictable band low on the front/rear of a vehicle. This crops that band, downsamples it,
// and looks for the vertical strip inside it with the most horizontal edge energy (i.e. where
// there's a dense run of light/dark transitions -- exactly what a plate's characters/border
// produce that plain bodywork doesn't). It's a real computation, not a guess at a fixed
// position, but it's still an estimate -- confidence-gated so a vehicle with no clear
// plate-like region (too far away, obscured, low light) just doesn't get a box drawn rather
// than showing a wrong one.
const SAMPLE_W = 48;
const SAMPLE_H = 20;
const MIN_SPAN_FRAC = 0.32;
const MAX_SPAN_FRAC = 0.62;
const MIN_CONFIDENCE = 1.35;
// Real number plates are wide rectangles, not squares -- Australian plates run about 2.7:1
// (width:height). The horizontal-energy scan above only ever finds the plate's likely width
// (a column span); this fixes the returned box's height to what a plate of that width would
// actually look like, instead of using the whole scanned crop band's height, which made the
// box read as a near-square guess rather than an actual plate shape.
const PLATE_ASPECT_RATIO = 2.7;
// Below this vehicle-box width (in source video pixels), a plate wouldn't be resolvable
// anyway -- skip the analysis entirely rather than spend time on noise. Tied to a real,
// measured floor (not a guess): a synthetic-plate OCR test found Tesseract reading correctly
// at 96% confidence on a 55px-wide native plate crop, but dropping to 0% (nothing read at all)
// once the native crop fell under ~40px -- upscaling afterward can't put back detail that was
// never captured. The found plate width is at most ~0.47 of the crop band's width (bestSpan's
// MAX_SPAN_FRAC=0.62 of a 0.76-of-vehicle-width crop band, see below), and realistically often
// less than that best case -- so this requires enough vehicle width that even a middling span
// still clears a real safety margin above that measured floor, instead of attempting (and
// silently failing) on a vehicle too small to ever produce a readable crop.
const MIN_VEHICLE_WIDTH_PX = 180;

// A vehicle seen face-on (front or rear) has a bounding box that's roughly as wide as it is
// tall -- you're looking at its width. A vehicle seen from the side has a box much wider than
// tall -- you're looking at its full length instead, which is exactly the case a plate isn't
// visible in (it's mounted on the front/rear, not the side) and where the "assumed avg vehicle
// width" pinhole distance/speed model below in speedTracker.ts doesn't apply either, since the
// box width there is length, not width. Above this width:height ratio, treat the view as
// side-on rather than guess at either.
const SIDE_ON_ASPECT_RATIO = 2.0;

/** True when a vehicle's box shape is consistent with a front/rear ("good") view rather than a
 *  side profile -- gates plate detection, the speed estimate, and the lock-on indicator, all of
 *  which assume you're looking at the vehicle's width, not its length. */
export function isFrontOrRearFacing(vehicleBbox: [number, number, number, number]): boolean {
  const [, , vw, vh] = vehicleBbox;
  if (vh <= 0) return false;
  return vw / vh < SIDE_ON_ASPECT_RATIO;
}

let sampleCanvas: HTMLCanvasElement | null = null;
function getSampleCanvas(): HTMLCanvasElement {
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = SAMPLE_W;
    sampleCanvas.height = SAMPLE_H;
  }
  return sampleCanvas;
}

export interface PlateBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Returns the estimated plate rectangle (in source video pixel coordinates) for one tracked
 *  vehicle's box, or null if no confident plate-like region was found this frame. */
export function locatePlate(
  video: HTMLVideoElement,
  vehicleBbox: [number, number, number, number]
): PlateBox | null {
  const [vx, vy, vw, vh] = vehicleBbox;
  if (vw < MIN_VEHICLE_WIDTH_PX) return null;
  if (!isFrontOrRearFacing(vehicleBbox)) return null;

  // The lower-middle band of the vehicle silhouette -- below the windows/grille, above the
  // wheels/ground shadow -- is where a plate sits on the overwhelming majority of vehicles
  // photographed from a following or oncoming angle.
  const cropX = vx + vw * 0.12;
  const cropY = vy + vh * 0.58;
  const cropW = vw * 0.76;
  const cropH = vh * 0.24;
  if (cropW < 4 || cropH < 4) return null;

  const canvas = getSampleCanvas();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, SAMPLE_W, SAMPLE_H);
  const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

  // Grayscale luminance per pixel, then per-column edge energy: the sum, down each column,
  // of the absolute brightness change from the pixel to its left. A run of plate characters
  // produces a tall spike here; a plain painted bumper stays close to flat.
  const lum = new Float32Array(SAMPLE_W * SAMPLE_H);
  for (let i = 0; i < SAMPLE_W * SAMPLE_H; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const colEnergy = new Float32Array(SAMPLE_W);
  for (let y = 0; y < SAMPLE_H; y++) {
    for (let x = 1; x < SAMPLE_W; x++) {
      colEnergy[x] += Math.abs(lum[y * SAMPLE_W + x] - lum[y * SAMPLE_W + x - 1]);
    }
  }

  const minSpan = Math.round(SAMPLE_W * MIN_SPAN_FRAC);
  const maxSpan = Math.round(SAMPLE_W * MAX_SPAN_FRAC);
  const totalEnergy = colEnergy.reduce((a, b) => a + b, 0);
  const avgPerCol = totalEnergy / SAMPLE_W || 1;

  let bestStart = -1;
  let bestSpan = minSpan;
  let bestAvg = 0;
  for (let span = minSpan; span <= maxSpan; span++) {
    let windowSum = 0;
    for (let x = 0; x < span; x++) windowSum += colEnergy[x];
    for (let start = 0; start + span <= SAMPLE_W; start++) {
      if (start > 0) {
        windowSum += colEnergy[start + span - 1] - colEnergy[start - 1];
      }
      const windowAvg = windowSum / span;
      if (windowAvg > bestAvg) {
        bestAvg = windowAvg;
        bestStart = start;
        bestSpan = span;
      }
    }
  }

  if (bestStart < 0 || bestAvg / avgPerCol < MIN_CONFIDENCE) return null;

  const foundW = (bestSpan / SAMPLE_W) * cropW;
  // Shrink the box down from the whole scanned band's height to a real plate's proportions,
  // centered in the band the energy spike was found in, rather than stretching the box to the
  // full searched height.
  const plateH = Math.min(cropH, foundW / PLATE_ASPECT_RATIO);

  return {
    x: cropX + (bestStart / SAMPLE_W) * cropW,
    y: cropY + (cropH - plateH) / 2,
    w: foundW,
    h: plateH,
  };
}
