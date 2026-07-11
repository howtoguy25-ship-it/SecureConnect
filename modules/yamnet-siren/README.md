# yamnet-siren (local Expo Module)

Native bridge that runs Google's pretrained **YAMNet** TFLite audio classifier on-device
and exposes a `siren` confidence score to the JS `sirenDetection` service
(`src/services/sirenDetection.ts`).

This module is scaffolding only — it defines the contract (`loadModel`, `classify`) and
where the native implementation goes, but shipping it end-to-end requires steps that
can't be done from source alone:

## Setup steps (do these before Phase 6 will actually detect anything)

1. **Switch off Expo Go.** TFLite bindings are native code, so this app needs a
   [custom dev client](https://docs.expo.dev/develop/development-builds/introduction/):
   ```
   npx expo install expo-dev-client
   npx expo prebuild
   eas build --profile development --platform ios   # and/or android
   ```
2. **Download the pretrained model.** Get `yamnet.tflite` from
   [TensorFlow Hub's YAMNet page](https://tfhub.dev/google/lite-model/yamnet/tflite/1) and
   the accompanying `yamnet_class_map.csv` (class index → label, e.g. "Siren",
   "Ambulance (siren)", "Fire engine, fire truck (siren)", "Police car (siren)").
   Place them in:
   - `android/app/src/main/assets/yamnet.tflite`
   - `ios/YamnetSiren/yamnet.tflite` (add to the Xcode target as a bundled resource)
3. **Implement `android/.../YamnetSirenModule.kt`** using `org.tensorflow:tensorflow-lite`
   (add the dependency in `android/build.gradle`). `classify()` should feed 15,600 mono
   16kHz float samples (YAMNet's fixed input window) into the interpreter and return the
   top scoring classes.
4. **Implement `ios/YamnetSirenModule.swift`** using `TensorFlowLiteSwift` (add via
   CocoaPods/SPM in `ios/YamnetSiren.podspec`). Same input/output contract as Android.
5. Rebuild the dev client after any native change — JS-only changes still hot reload as
   usual.

## Contract

```ts
loadModel(): Promise<boolean>
classify(pcmSamples: number[]): Promise<{ label: string; confidence: number }[]>
```

`pcmSamples` is one ~1 second window of mono 16kHz PCM audio as floats in [-1, 1].
`classify` returns YAMNet's class scores; `sirenDetection.ts` only looks at the
siren/emergency-vehicle-related labels and ignores the rest.

Until steps 1-4 are done, `src/native/yamnetNative.ts` detects the missing native module
and no-ops with a console warning — the rest of the app (navigation, alerts, settings)
works normally without it.
