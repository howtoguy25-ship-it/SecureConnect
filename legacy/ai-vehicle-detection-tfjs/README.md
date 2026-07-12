# AI Vehicle Detection — superseded (July 2026)

These files are kept as a historical reference, not because anything still depends on them.
They were the working implementation before the Expo SDK 51 → 57 upgrade, built on
`@tensorflow/tfjs-react-native`. That library is unmaintained: its last release (1.0.0) still
requires `expo-camera ^13` and `expo-gl ^13`, roughly 44 major versions behind what SDK 57
ships, and its `expo-gl` dependency fails to compile under any Xcode 26 release
(`std::allocator<const std::string>` static assertion, confirmed on both the oldest and
newest Xcode 26 build images) — which Apple now requires for every App Store submission.

## What replaced it

`src/services/vehicleClassifier.ts` and `src/services/vehicleDetection.ts` do the exact same
job again (same trained model, same COCO-SSD + custom-classifier two-stage approach, same
confidence thresholds) but without depending on the abandoned library at all:

- `src/services/tfPlatform.ts` — a small React Native platform shim for tfjs-core
  (`fetch`/`now`/`encode`/`decode`/`isTypedArray`) plus the CPU backend.
  `@tensorflow/tfjs-react-native` used to provide this as a side effect of importing it —
  without it, tfjs-core doesn't auto-detect a "browser" (no `window.document` in React
  Native) or "node" platform and never registers one at all, so a real replacement was
  needed, not just a workaround.
- `src/services/modelAssetIO.ts` — replaces `bundleResourceIO` with a plain `tf.io.IOHandler`
  built on `expo-asset` + `expo-file-system` (both actively maintained, version-locked to the
  rest of the app) to load the bundled `model.json` + weight shards.
- `vehicleDetection.ts` now decodes captured JPEGs with `jpeg-js` (a plain, maintained,
  platform-independent decoder) instead of the removed `decodeJpeg`.

Net effect: same feature, same model, same detection logic — CPU inference instead of GPU
(via `expo-gl`), which is slower per-frame but was already only sampling a photo every 1.2s,
not a live video stream, so it's a reasonable trade for something that actually builds.
