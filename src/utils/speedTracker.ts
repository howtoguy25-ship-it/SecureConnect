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
  state: "moving" | "parked";
}

interface InternalTrack {
  id: number;
  bbox: [number, number, number, number];
  // Last time this track had an *actual* detection match -- not touched while a track is
  // being carried forward through its grace period below.
  lastSeenMs: number;
  // Smoothed (DISTANCE_SMOOTHING), not the raw per-frame estimate -- see its own comment below
  // for why smoothing this specifically (not just the bbox) was the real fix for wildly jumping
  // speed readings.
  distanceM: number;
  speedKmh: number | null;
  center: [number, number];
  state: "moving" | "parked";
  // When the current run of below-threshold centroid movement started -- null while actually
  // moving. Used to require a *sustained* 2.5s of near-zero displacement before calling a
  // vehicle parked, instead of one still frame (a red light, momentary occlusion) suppressing
  // its speed.
  lowMovementSinceMs: number | null;
  // Consecutive frames of above-threshold movement seen *while parked* -- requires a few in a
  // row before resuming live speed, so a single noisy frame (camera shake) doesn't flicker a
  // truly parked car back to a fake speed reading.
  aboveThresholdStreak: number;
}

// A parked car's box still jitters a pixel or two frame-to-frame from detector noise alone --
// this is the displacement (as a fraction of frame width) below which movement doesn't count
// as "real" motion.
const NOISE_THRESHOLD_RATIO = 0.015;
const PARKED_AFTER_MS = 2500;
const RESUME_AFTER_FRAMES = 3;

// How long a track survives a missed detection before its identity is given up on -- a
// partially-visible or edge-of-frame vehicle can easily fail to detect for a single frame
// even though it's still really there. Without this grace period, that one missed frame
// dropped the track immediately and started a brand new one next frame, meaning a fresh (and
// possibly different) classification attempt for what's actually the same vehicle -- which is
// what showed up as the same ordinary car flip-flopping between "Police car" and "Vehicle".
const TRACK_GRACE_MS = 600;
// How much a tracked box eases toward each new raw detection instead of snapping straight to
// it -- the underlying detector's box coordinates jitter slightly frame to frame even for a
// vehicle that isn't really moving relative to the frame, which read as the box not quite
// "attached" to the vehicle.
const BBOX_SMOOTHING = 0.4;
// The real, confirmed fix for speed readings jumping around (0, then 100, then 25 km/h on a
// vehicle that isn't doing anything of the sort): distance was being estimated from the box
// width of that frame's *raw* detection, not the smoothed box used for rendering -- and since
// speed is a derivative (distance change / a short ~0.7-1.1s time step), even a few pixels of
// ordinary detector width jitter got amplified into a large apparent speed swing every tick.
// Smoothing distance directly (its own EMA, not just inherited from bbox smoothing, since the
// width-to-distance transform is nonlinear) tames that at the source.
const DISTANCE_SMOOTHING = 0.35;
// Second layer of protection: even a smoothed distance signal can still produce one genuinely
// implausible reading (a brief false rematch to a different nearby vehicle, a single very bad
// frame). No real car changes speed anywhere near this fast -- 0-100 km/h in under 4 seconds is
// already supercar-tier acceleration -- so clamp the maximum speed change any single tick is
// allowed to report, relative to elapsed time, rather than ever displaying a physically
// impossible jump.
const MAX_ACCEL_KMH_PER_SEC = 25;

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

      const rawDistanceM = estimateDistanceM(det.bbox[2], imageWidthPx);
      let speedKmh: number | null = null;

      if (best) {
        unmatched.delete(best.id);
        matchedIds.add(best.id);

        const dispRatio = Math.hypot(cx - best.center[0], cy - best.center[1]) / imageWidthPx;
        const movingNow = dispRatio >= NOISE_THRESHOLD_RATIO;

        let state = best.state;
        let lowMovementSinceMs = best.lowMovementSinceMs;
        let aboveThresholdStreak = best.aboveThresholdStreak;

        if (state === "moving") {
          if (movingNow) {
            lowMovementSinceMs = null;
          } else {
            if (lowMovementSinceMs === null) lowMovementSinceMs = nowMs;
            if (nowMs - lowMovementSinceMs >= PARKED_AFTER_MS) state = "parked";
          }
          aboveThresholdStreak = 0;
        } else {
          aboveThresholdStreak = movingNow ? aboveThresholdStreak + 1 : 0;
          if (aboveThresholdStreak >= RESUME_AFTER_FRAMES) {
            state = "moving";
            lowMovementSinceMs = null;
            aboveThresholdStreak = 0;
          }
        }

        // Smoothed against the track's own previous smoothed distance, not the raw estimate --
        // see DISTANCE_SMOOTHING's comment above for why this (not just bbox smoothing) is what
        // actually stops speed from swinging wildly frame to frame.
        const distanceM = best.distanceM + (rawDistanceM - best.distanceM) * DISTANCE_SMOOTHING;

        const dtSec = (nowMs - best.lastSeenMs) / 1000;
        if (state === "moving" && dtSec > 0.15) {
          const closingMPerSec = (best.distanceM - distanceM) / dtSec;
          let rawKmh = closingMPerSec * 3.6;
          if (best.speedKmh !== null) {
            // Clamp to a physically plausible acceleration -- see MAX_ACCEL_KMH_PER_SEC.
            const maxDeltaKmh = MAX_ACCEL_KMH_PER_SEC * dtSec;
            rawKmh = Math.max(best.speedKmh - maxDeltaKmh, Math.min(best.speedKmh + maxDeltaKmh, rawKmh));
          }
          speedKmh = best.speedKmh === null ? rawKmh : best.speedKmh * 0.7 + rawKmh * 0.3;
        } else if (state === "moving") {
          speedKmh = best.speedKmh;
        } else {
          // Parked -- speed is suppressed entirely rather than left to decay toward zero, so
          // the UI shows a clean "PARKED" state instead of a jittery near-zero number.
          speedKmh = null;
        }

        const bbox = smoothBbox(best.bbox, det.bbox, BBOX_SMOOTHING);
        nextTracks.push({
          id: best.id,
          bbox,
          lastSeenMs: nowMs,
          distanceM,
          speedKmh,
          center: [cx, cy],
          state,
          lowMovementSinceMs,
          aboveThresholdStreak,
        });
        result.push({
          id: best.id,
          bbox,
          score: det.score,
          label: det.label,
          confidence: det.confidence,
          speedKmh,
          state,
        });
      } else {
        const id = nextId++;
        nextTracks.push({
          id,
          bbox: det.bbox,
          lastSeenMs: nowMs,
          distanceM: rawDistanceM,
          speedKmh: null,
          center: [cx, cy],
          state: "moving",
          lowMovementSinceMs: null,
          aboveThresholdStreak: 0,
        });
        result.push({
          id,
          bbox: det.bbox,
          score: det.score,
          label: det.label,
          confidence: det.confidence,
          speedKmh: null,
          state: "moving",
        });
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
  // produce a box in this frame's `update()` result. Callers caching per-vehicle state (plate
  // OCR reads) need to prune against THIS, not against `update()`'s own return value -- a
  // track surviving a single missed detection frame emits nothing in `result` for that frame,
  // so pruning off `result` alone would wipe that cached state on the very miss the grace
  // period exists to ride out.
  function liveTrackIds(): Set<number> {
    return new Set(tracks.map((t) => t.id));
  }

  return { update, liveTrackIds };
}
