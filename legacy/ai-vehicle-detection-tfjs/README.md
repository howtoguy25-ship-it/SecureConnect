# AI Vehicle Detection — parked pending a rewrite (July 2026)

These two files are the exact working implementation from before the Expo SDK 51 → 57
upgrade. They're moved here (out of `src/`, excluded from `tsconfig.json`) rather than
deleted, because `@tensorflow/tfjs-react-native` — the library `vehicleDetection.ts` depends
on — is unmaintained: its last release (1.0.0) still requires `expo-camera ^13` and
`expo-gl ^13`, roughly 44 major versions behind what SDK 57 ships. It compiles against
`expo-gl`'s C++ but fails to build under Xcode 26 (`std::allocator<const std::string>` static
assertion, confirmed on both the oldest and newest Xcode 26 build images), which Apple now
requires for every App Store submission. There's no newer compatible version to upgrade to —
this isn't a version-pinning problem, it's an abandoned dependency.

## What worked (and should again, once re-wired)

- `vehicleClassifier.ts` — loads the same custom-trained TF.js model used by the web app
  (`ambulance`/`firetruck`/`police-car`/`other`, ~500-image training set) and classifies a
  cropped vehicle region.
- `vehicleDetection.ts` — runs COCO-SSD for generic vehicle boxes, then the custom classifier
  on each box, same two-stage approach as the web app's `LiveVehicleDetection.tsx`.

## The actual fix needed

Replace the `expo-camera` + `expo-gl` + `@tensorflow/tfjs-react-native` pipeline with a
currently-maintained on-device inference path. The cleanest option, matching the pattern
already used elsewhere in this app: a real native Expo Module (see `modules/yamnet-siren/`
for the working example) that runs TFLite directly via CoreML/Vision (iOS) and TFLite/NNAPI
(Android) instead of routing through TensorFlow.js's React Native/WebGL bridge at all. The
trained model would need converting from the current `.json`/`.bin` TF.js format to `.tflite`
(a real, mechanical conversion — same model weights, no retraining needed).

`VehicleDetectionScreen.tsx` (still in `src/screens/`, not removed) currently shows an honest
"temporarily unavailable" state instead of calling into this. Once the native module above
exists, wire its output back into that screen the same way `detectVehiclesInPhoto()` used to.
