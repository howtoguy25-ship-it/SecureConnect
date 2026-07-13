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
// Below this vehicle-box width (in source video pixels), a plate wouldn't be resolvable
// anyway -- skip the analysis entirely rather than spend time on noise.
const MIN_VEHICLE_WIDTH_PX = 70;

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

  return {
    x: cropX + (bestStart / SAMPLE_W) * cropW,
    y: cropY,
    w: (bestSpan / SAMPLE_W) * cropW,
    h: cropH,
  };
}
