// Rough monocular speed estimate: true calibrated speed needs radar/lidar or a
// calibrated stereo/known-geometry setup, neither of which a single phone camera has.
// This gives a physically real (not fabricated) estimate by:
//  1. Assuming an average vehicle width (~1.8m) since we don't know the real one.
//  2. Estimating the camera's focal length from a typical phone horizontal FOV (~68deg).
//  3. Using the pinhole camera model (distance = real_width * focal_px / box_width_px)
//     to get an approximate distance at each frame.
//  4. Dividing the distance change between frames by elapsed time for closing speed.
// Error sources: the width assumption, the FOV assumption, and that this only measures
// speed directly toward/away from the camera (not a car crossing at an angle) all mean
// this is a real but rough estimate, not a radar-grade reading.
const ASSUMED_VEHICLE_WIDTH_M = 1.8;
const ASSUMED_FOCAL_LENGTH_FACTOR = 0.75; // imageWidthPx * this ≈ focal length in px

export interface TrackedBox {
  id: number;
  bbox: [number, number, number, number];
  score: number;
  label: string;
  confidence?: number;
  speedKmh: number | null;
}

interface InternalTrack {
  id: number;
  bbox: [number, number, number, number];
  lastSeenMs: number;
  distanceM: number;
  speedKmh: number | null;
}

function boxCenter(bbox: [number, number, number, number]): [number, number] {
  return [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2];
}

function estimateDistanceM(boxWidthPx: number, imageWidthPx: number): number {
  const focalLengthPx = imageWidthPx * ASSUMED_FOCAL_LENGTH_FACTOR;
  return (ASSUMED_VEHICLE_WIDTH_M * focalLengthPx) / Math.max(boxWidthPx, 1);
}

export function createSpeedTracker() {
  let tracks: InternalTrack[] = [];
  let nextId = 1;

  function update(
    detections: {
      bbox: [number, number, number, number];
      score: number;
      label: string;
      confidence?: number;
    }[],
    imageWidthPx: number,
    nowMs: number
  ): TrackedBox[] {
    const unmatched = new Set(tracks.map((t) => t.id));
    const result: TrackedBox[] = [];
    const nextTracks: InternalTrack[] = [];

    for (const det of detections) {
      const [cx, cy] = boxCenter(det.bbox);
      const maxDist = Math.max(det.bbox[2], det.bbox[3]) * 1.2;

      let best: InternalTrack | null = null;
      let bestDist = Infinity;
      for (const t of tracks) {
        if (!unmatched.has(t.id)) continue;
        const [tcx, tcy] = boxCenter(t.bbox);
        const d = Math.hypot(cx - tcx, cy - tcy);
        if (d < maxDist && d < bestDist) {
          best = t;
          bestDist = d;
        }
      }

      const distanceM = estimateDistanceM(det.bbox[2], imageWidthPx);
      let speedKmh: number | null = null;

      if (best) {
        unmatched.delete(best.id);
        const dtSec = (nowMs - best.lastSeenMs) / 1000;
        if (dtSec > 0.15) {
          const closingMPerSec = (best.distanceM - distanceM) / dtSec;
          const rawKmh = closingMPerSec * 3.6;
          speedKmh = best.speedKmh === null ? rawKmh : best.speedKmh * 0.6 + rawKmh * 0.4;
        } else {
          speedKmh = best.speedKmh;
        }
        nextTracks.push({ id: best.id, bbox: det.bbox, lastSeenMs: nowMs, distanceM, speedKmh });
        result.push({
          id: best.id,
          bbox: det.bbox,
          score: det.score,
          label: det.label,
          confidence: det.confidence,
          speedKmh,
        });
      } else {
        const id = nextId++;
        nextTracks.push({ id, bbox: det.bbox, lastSeenMs: nowMs, distanceM, speedKmh: null });
        result.push({
          id,
          bbox: det.bbox,
          score: det.score,
          label: det.label,
          confidence: det.confidence,
          speedKmh: null,
        });
      }
    }

    tracks = nextTracks;
    return result;
  }

  return { update };
}
