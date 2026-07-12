// Real, physically-grounded heuristic for spotting an *active* emergency light -- a bright,
// rapidly toggling red or blue light -- inside a tracked vehicle's box, regardless of
// whether the vehicle itself looks like a marked police car. Genuine lightbars/dash/grille
// lights strobe on and off roughly 1-10 times a second at high color saturation; a static
// tail light, blue car paint, or a red sign in the background stays constant instead of
// toggling, so this only fires on the actual flashing -- it gives nothing to detect on a
// dark, unactivated unmarked car, the same way a real driver wouldn't notice one either.
//
// This is deliberately NOT a claim to detect antennas, push bars, or small modified plate
// hardware -- reliably recognizing those from a moving phone camera would need a purpose-
// trained model on a large labeled dataset of unmarked-vehicle photos, and no such dataset
// or model exists for this project (or, as far as could be sourced, anywhere public).
// Building that honestly is a much bigger undertaking than this heuristic, so it isn't
// included -- this only ever fires off the one signal that's actually detectable: the
// lights themselves, while they're on.
interface TrackWindow {
  samples: { active: boolean; timestampMs: number }[];
}

const WINDOW_MS = 1500;
const MIN_TOGGLES = 3;
const SAMPLE_SIZE = 24;
const ACTIVE_PIXEL_FRACTION = 0.012;

const trackWindows = new Map<number, TrackWindow>();
let sampleCanvas: HTMLCanvasElement | null = null;

function getSampleCanvas(): HTMLCanvasElement {
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = SAMPLE_SIZE;
    sampleCanvas.height = SAMPLE_SIZE;
  }
  return sampleCanvas;
}

function isActiveLightFrame(video: HTMLVideoElement, bbox: [number, number, number, number]): boolean {
  const [x, y, w, h] = bbox;
  if (w < 8 || h < 8) return false;

  const canvas = getSampleCanvas();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  ctx.drawImage(video, x, y, w, h, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  let saturatedCount = 0;
  const total = SAMPLE_SIZE * SAMPLE_SIZE;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const isStrongRed = r > 175 && r - Math.max(g, b) > 60;
    const isStrongBlue = b > 165 && b - Math.max(r, g) > 45;
    if (isStrongRed || isStrongBlue) saturatedCount++;
  }

  return saturatedCount / total > ACTIVE_PIXEL_FRACTION;
}

/** Feeds one frame's reading for a tracked vehicle and returns whether an actively
 *  strobing light (a real emergency-lightbar signature) has been confirmed for it recently
 *  -- requires several on/off toggles within a rolling window, not just one bright frame. */
export function sampleLightbarActivity(
  video: HTMLVideoElement,
  trackId: number,
  bbox: [number, number, number, number],
  nowMs: number
): boolean {
  const active = isActiveLightFrame(video, bbox);

  let track = trackWindows.get(trackId);
  if (!track) {
    track = { samples: [] };
    trackWindows.set(trackId, track);
  }
  track.samples.push({ active, timestampMs: nowMs });
  track.samples = track.samples.filter((s) => nowMs - s.timestampMs <= WINDOW_MS);

  let toggles = 0;
  for (let i = 1; i < track.samples.length; i++) {
    if (track.samples[i].active !== track.samples[i - 1].active) toggles++;
  }
  const activeSampleCount = track.samples.filter((s) => s.active).length;

  return toggles >= MIN_TOGGLES && activeSampleCount >= 2;
}

/** Drops tracking state for vehicle ids no longer being tracked, so memory doesn't grow
 *  unbounded across a long detection session. */
export function pruneLightbarTracks(liveTrackIds: Set<number>): void {
  for (const id of trackWindows.keys()) {
    if (!liveTrackIds.has(id)) trackWindows.delete(id);
  }
}
