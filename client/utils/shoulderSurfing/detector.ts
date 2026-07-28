// Best-effort "something changed in the front camera's view" signal.
//
// IMPORTANT — what this is and isn't: this build does not ship a real
// face-detection model. expo-camera (the only camera dependency in this
// project) exposes no face/object detection API, and adding one
// (react-native-vision-camera + an ML Kit / Vision frame-processor plugin)
// requires new native modules and a fresh native (EAS) build that can't be
// compiled or exercised on a real device from this environment. Shipping
// that untested would be worse than not shipping it.
//
// Instead this uses a lightweight, dependency-free heuristic that is real
// and does run on-device: it samples small JPEG snapshots from the front
// camera at a fixed interval and tracks the *compressed byte size* of each
// snapshot. JPEG size correlates with visual complexity/detail in frame —
// a second face or head entering the shot behind the primary user
// typically adds edges/detail and produces a noticeable, sustained jump in
// compressed size relative to the recent baseline. It is a motion/complexity
// trip-wire, not identity- or face-count-aware, so it will have false
// positives (e.g. someone walking by in the background) and false
// negatives (a very still onlooker). It is intentionally tuned to require
// two consecutive elevated samples before firing, to cut down on single-frame
// noise. Treat it as "something in view changed enough to be worth asking
// the user," not as a security guarantee.
export interface PeekDetectorOptions {
  windowSize?: number; // rolling baseline sample count
  triggerRatio?: number; // e.g. 0.35 = newest sample 35% above baseline
  consecutiveRequired?: number;
}

export class PeekSignalDetector {
  private history: number[] = [];
  private consecutiveHits = 0;
  private readonly windowSize: number;
  private readonly triggerRatio: number;
  private readonly consecutiveRequired: number;

  constructor(options: PeekDetectorOptions = {}) {
    this.windowSize = options.windowSize ?? 6;
    this.triggerRatio = options.triggerRatio ?? 0.35;
    this.consecutiveRequired = options.consecutiveRequired ?? 2;
  }

  reset() {
    this.history = [];
    this.consecutiveHits = 0;
  }

  private baseline(): number | null {
    if (this.history.length < 3) return null;
    const sorted = [...this.history].sort((a, b) => a - b);
    // Median is more robust than mean against one-off outlier frames already
    // sitting in the window.
    return sorted[Math.floor(sorted.length / 2)];
  }

  // Feed one frame's compressed byte size. Returns true exactly on the
  // sample that completes `consecutiveRequired` elevated readings in a row.
  addSample(byteLength: number): boolean {
    const baseline = this.baseline();
    let triggered = false;

    if (baseline !== null && baseline > 0) {
      const elevated = byteLength >= baseline * (1 + this.triggerRatio);
      if (elevated) {
        this.consecutiveHits += 1;
        if (this.consecutiveHits >= this.consecutiveRequired) {
          triggered = true;
          this.consecutiveHits = 0;
          this.history = []; // start a fresh baseline after firing
          return true;
        }
      } else {
        this.consecutiveHits = 0;
      }
    }

    this.history.push(byteLength);
    if (this.history.length > this.windowSize) this.history.shift();
    return triggered;
  }
}
