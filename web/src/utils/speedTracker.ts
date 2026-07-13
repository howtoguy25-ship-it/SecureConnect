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
  speedKmh: number | null;
  // Same pinhole-model estimate used for speed above, exposed directly so callers (e.g. a
  // "closest vehicle" indicator) don't need to re-derive it from bbox width themselves.
  distanceM: number;
}

interface InternalTrack {
  id: number;
  bbox: [number, number, number, number];
  // Last time this track had an *actual* detection match -- not touched while a track is
  // being carried forward through its grace period below, so it doubles as both the speed
  // calculation's elapsed-time base and the "how long has this track been unseen" check.
  lastSeenMs: number;
  distanceM: number;
  speedKmh: number | null;
}

// How long a track survives a missed detection before its identity is given up on. A
// partially-visible or edge-of-frame vehicle (exactly the hard case a phone camera sees a
// lot of) can easily fail to detect for a single frame even though it's still really there --
// without this grace period, that one missed frame used to immediately drop the track and
// start a brand new one next frame, which meant a brand new (and possibly different)
// classification attempt for what's actually the same vehicle. That's what was showing up as
// the same ordinary car flip-flopping between "Police car" and "Vehicle" a moment apart.
const TRACK_GRACE_MS = 600;
// How much a tracked box eases toward each new raw detection instead of snapping straight to
// it -- COCO-SSD's box coordinates jitter slightly frame to frame even for a vehicle that
// isn't really moving relative to the frame, which reads as the box not quite "attached" to
// the vehicle. This keeps the drawn box visually steady without meaningfully lagging behind
// real movement.
const BBOX_SMOOTHING = 0.55;

function boxCenter(bbox: [number, number, number, number]): [number, number] {
  return [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2];
}

function smoothBbox(
  prev: [number, number, number, number],
  next: [number, number, number, number],
  alpha: number
): [number, number, number, number] {
  return [
    prev[0] + (next[0] - prev[0]) * alpha,
    prev[1] + (next[1] - prev[1]) * alpha,
    prev[2] + (next[2] - prev[2]) * alpha,
    prev[3] + (next[3] - prev[3]) * alpha,
  ];
}

function estimateDistanceM(boxWidthPx: number, imageWidthPx: number): number {
  const focalLengthPx = imageWidthPx * ASSUMED_FOCAL_LENGTH_FACTOR;
  return (ASSUMED_VEHICLE_WIDTH_M * focalLengthPx) / Math.max(boxWidthPx, 1);
}

export function createSpeedTracker() {
  let tracks: InternalTrack[] = [];
  let nextId = 1;

  function update(
    detections: { bbox: [number, number, number, number]; score: number }[],
    imageWidthPx: number,
    nowMs: number
  ): TrackedBox[] {
    const unmatched = new Set(tracks.map((t) => t.id));
    const result: TrackedBox[] = [];
    const nextTracks: InternalTrack[] = [];
    const matchedIds = new Set<number>();

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
        matchedIds.add(best.id);
        const dtSec = (nowMs - best.lastSeenMs) / 1000;
        if (dtSec > 0.15) {
          const closingMPerSec = (best.distanceM - distanceM) / dtSec;
          const rawKmh = closingMPerSec * 3.6;
          // Smooth against the previous reading so it doesn't jitter frame to frame.
          speedKmh = best.speedKmh === null ? rawKmh : best.speedKmh * 0.6 + rawKmh * 0.4;
        } else {
          speedKmh = best.speedKmh;
        }
        const bbox = smoothBbox(best.bbox, det.bbox, BBOX_SMOOTHING);
        nextTracks.push({ id: best.id, bbox, lastSeenMs: nowMs, distanceM, speedKmh });
        result.push({ id: best.id, bbox, score: det.score, speedKmh, distanceM });
      } else {
        const id = nextId++;
        nextTracks.push({ id, bbox: det.bbox, lastSeenMs: nowMs, distanceM, speedKmh: null });
        result.push({ id, bbox: det.bbox, score: det.score, speedKmh: null, distanceM });
      }
    }

    // Tracks that weren't matched this frame are kept alive (not shown, since there's no
    // fresh detection to draw a box for) for a short grace period in case the miss was just
    // one bad frame, instead of immediately discarding their identity.
    for (const t of tracks) {
      if (!matchedIds.has(t.id) && nowMs - t.lastSeenMs < TRACK_GRACE_MS) {
        nextTracks.push(t);
      }
    }

    tracks = nextTracks;
    return result;
  }

  // Every id currently held onto internally, including ones mid-grace-period that didn't
  // produce a box in this frame's `update()` result. Callers that cache per-vehicle state
  // (plate OCR reads, lightbar samples, lock-on progress) need to prune against THIS, not
  // against `update()`'s own return value -- a track surviving a single missed detection
  // frame emits nothing in `result` for that frame, so pruning off `result` alone would wipe
  // that cached state on the very miss the grace period exists to ride out.
  function liveTrackIds(): Set<number> {
    return new Set(tracks.map((t) => t.id));
  }

  return { update, liveTrackIds };
}
