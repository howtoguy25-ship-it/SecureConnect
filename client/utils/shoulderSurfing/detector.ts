// Real face-count detection via Google ML Kit (on-device, via
// @react-native-ml-kit/face-detection). ShoulderSurfingGuard captures a
// still frame from the front camera periodically and runs it through
// FaceDetection.detect(), which returns one entry per face ML Kit finds in
// the image. If it finds more than one face (the device owner + someone
// else in frame) for `consecutiveRequired` samples in a row, that's a real
// "someone else may be looking at your screen" signal — not a heuristic
// proxy. The consecutive-sample requirement is still there to smooth over
// a single misdetected frame (motion blur, bad angle), not to compensate
// for a fake signal.
export interface PeekDetectorOptions {
  consecutiveRequired?: number;
}

export class PeekSignalDetector {
  private consecutiveHits = 0;
  private readonly consecutiveRequired: number;

  constructor(options: PeekDetectorOptions = {}) {
    this.consecutiveRequired = options.consecutiveRequired ?? 2;
  }

  reset() {
    this.consecutiveHits = 0;
  }

  // Feed the number of faces ML Kit detected in one frame. Returns true
  // exactly on the sample that completes `consecutiveRequired` readings of
  // more than one face in a row.
  addSample(faceCount: number): boolean {
    if (faceCount > 1) {
      this.consecutiveHits += 1;
      if (this.consecutiveHits >= this.consecutiveRequired) {
        this.consecutiveHits = 0;
        return true;
      }
    } else {
      this.consecutiveHits = 0;
    }
    return false;
  }
}
