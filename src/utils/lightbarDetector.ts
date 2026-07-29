import type { DecodedPhoto } from "@/services/vehicleDetection";

// Real, physically-grounded heuristic for spotting an *active* emergency light -- a bright,
// rapidly toggling red or blue light -- inside a tracked vehicle's box, regardless of
// whether the vehicle itself looks like a marked police car. Genuine lightbars/dash/grille
// lights strobe on and off roughly 1-10 times a second at high color saturation; a static
// tail light, blue car paint, or a red sign in the background stays constant instead of
// toggling, so this only fires on the actual flashing. Ported from the web app's
// utils/lightbarDetector.ts -- same thresholds, same toggle-counting state machine, just
// sampling pixels from each capture's already-decoded JPEG buffer (see
// vehicleDetection.ts's DecodedPhoto) instead of a live <video>/canvas frame, since mobile
// captures discrete photos rather than continuously reading video frames.
//
// This is deliberately NOT a claim to detect antennas, push bars, or small modified plate
// hardware -- see the web file for the full rationale. Only the lights themselves, while
// they're actually on.
interface TrackWindow {
  samples: { active: boolean; timestampMs: number }[];
}

const WINDOW_MS = 4000;
const MIN_TOGGLES = 2;
const ACTIVE_PIXEL_FRACTION = 0.012;

const trackWindows = new Map<number, TrackWindow>();

function isActiveLightCrop(photo: DecodedPhoto, bbox: [number, number, number, number]): boolean {
  const [x, y, w, h] = bbox;
  if (w < 8 || h < 8) return false;

  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(photo.width, Math.round(x + w));
  const bottom = Math.min(photo.height, Math.round(y + h));
  if (right <= left || bottom <= top) return false;

  // Sample a coarse grid rather than every pixel in the crop -- plenty for a saturation
  // fraction estimate and far cheaper per capture than a full-resolution scan.
  const SAMPLE_STEPS = 24;
  const stepX = Math.max(1, Math.floor((right - left) / SAMPLE_STEPS));
  const stepY = Math.max(1, Math.floor((bottom - top) / SAMPLE_STEPS));

  let saturatedCount = 0;
  let total = 0;
  for (let py = top; py < bottom; py += stepY) {
    for (let px = left; px < right; px += stepX) {
      const idx = (py * photo.width + px) * 3;
      const r = photo.data[idx];
      const g = photo.data[idx + 1];
      const b = photo.data[idx + 2];
      const isStrongRed = r > 175 && r - Math.max(g, b) > 60;
      const isStrongBlue = b > 165 && b - Math.max(r, g) > 45;
      if (isStrongRed || isStrongBlue) saturatedCount++;
      total++;
    }
  }

  return total > 0 && saturatedCount / total > ACTIVE_PIXEL_FRACTION;
}

/** Feeds one capture's reading for a tracked vehicle and returns whether an actively
 *  strobing light (a real emergency-lightbar signature) has been confirmed for it recently
 *  -- requires more than one on/off toggle within a rolling window, not just one bright
 *  frame (a single saturated capture could just be a genuine tail light or reflection). */
export function sampleLightbarActivity(
  photo: DecodedPhoto,
  trackId: number,
  bbox: [number, number, number, number],
  nowMs: number
): boolean {
  const active = isActiveLightCrop(photo, bbox);

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
